# Jira Idempotency & Step-Level Concurrency

This document describes how GovFlow avoids duplicating external Jira side
effects (comments and transitions) when a workflow execution is retried, fails
partially, or runs concurrently with recovery. It reflects Sprint 6.4.2.

## Central problem

External Jira operations are **not transactional with the database**. A worker
can successfully call the Jira API and then fail before persisting the result:

```txt
Worker calls Jira (create comment / apply transition)
  -> Jira returns success
  -> GovFlow fails before persisting the result
  -> BullMQ retries the job
  -> the same step could call Jira again -> duplicate side effect
```

GovFlow cannot make the Jira call and the database write atomic. Instead it
reduces duplication with several layers of **local** protection built on top of
state persisted in `workflow_execution_steps`.

> Architecture rule preserved: **Worker -> Processor -> Handler ->
> JiraIntegrationService -> Jira API.** The worker does not know Jira; the
> processor decides whether to call a handler; only the handler calls the Jira
> service.

## Implemented layers

### 1. Atomic step claim

A step is only processed if it can be claimed atomically (`PENDING -> RUNNING`):

```sql
UPDATE workflow_execution_steps
SET status = 'RUNNING', started_at = COALESCE(started_at, NOW()), ...
WHERE id = $1 AND status = 'PENDING'
RETURNING *;
```

If the claim matches no rows, the step is not `PENDING` and its handler is **not
called**, so a step that already ran is never re-run blindly. This guards
against two workers (or a job retry) processing the same step.

### 2. Retryable failure reverts the step to PENDING

`FAILED` is reserved for **terminal/business** failures. A **retryable
(technical)** step failure reverts the claimed step back to `PENDING` before
re-throwing to BullMQ, so the next attempt re-claims **only** the step that
failed — already-`COMPLETED` steps are skipped instead of re-run.

### 3. Per-step output (JSONB)

`workflow_execution_steps.output` (migration `008`, nullable JSONB) stores the
external operation result on the step itself, not only in the aggregated
`workflow_executions.result`. This closes the window where the Jira effect had
happened but nothing was queryable per step.

### 4. Idempotency key per workflow_execution_step

When a step completes, the processor stamps the output with a deterministic key
derived from the **execution step id** (not the workflow step template id):

```txt
idempotencyKey = "workflowExecutionStep:<workflowExecutionStepId>"
```

The same enriched output is written to both `workflow_execution_steps.output`
and `workflow_executions.result.steps[].output`.

### 5. Local dedup for JIRA_COMMENT

Before invoking the handler for a claimed step, the processor checks the
persisted output. If it proves a comment was already created
(`provider = "jira"`, `operation = "comment"`, `commentId` present), the handler
(and therefore Jira) is **not** called; the persisted output is reused.

### 6. Local dedup for JIRA_TRANSITION

Same guard for transitions: if the persisted output proves a transition was
already applied (`provider = "jira"`, `operation = "transition"`,
`transitionId` present), the handler is not called and the persisted output is
reused. Transitions are more delicate than comments — see *Residual risks*.

## Step lifecycle

```txt
PENDING --claim--> RUNNING --success--> COMPLETED
                         \--business failure--> FAILED (terminal)
                         \--retryable failure--> PENDING (re-claimed on retry)
```

- `COMPLETED` steps are skipped on retry (handler not called); their persisted
  output is reused.
- `FAILED` means a terminal/business failure; it is not reprocessed.
- A `RUNNING` step that cannot be claimed (left by a hard crash, or a lost claim
  race) is **not** re-run and the execution is **not** finalized as
  `COMPLETED`; the processor raises a controlled retryable error so BullMQ
  retries, and the stale-running recovery resolves it if it stays stuck.

## Persisted output format

`JIRA_COMMENT`:

```json
{
  "provider": "jira",
  "operation": "comment",
  "issueKey": "DO-32",
  "commentId": "10235",
  "status": "completed",
  "idempotencyKey": "workflowExecutionStep:<workflowExecutionStepId>"
}
```

`JIRA_TRANSITION`:

```json
{
  "provider": "jira",
  "operation": "transition",
  "issueKey": "DO-32",
  "transitionId": "31",
  "status": "completed",
  "idempotencyKey": "workflowExecutionStep:<workflowExecutionStepId>"
}
```

A step skipped without a persisted output (legacy rows created before migration
`008`) falls back to `{ "skipped": true, "reason": "already_completed" }`.

## Audit reasons

Skips and guards are audited as `WORKFLOW_EXECUTION_STEP_SKIPPED` with a
`reason` in the metadata:

| reason | meaning |
| --- | --- |
| `already_completed` | step was already `COMPLETED`; skipped on retry |
| `comment_already_created` | persisted output proves the Jira comment exists; handler skipped |
| `transition_already_applied` | persisted output proves the Jira transition was applied; handler skipped |
| `running_unresolved` | step is `RUNNING` and cannot be claimed (likely a crashed attempt) |
| `already_failed` | step is in a terminal `FAILED` state |
| `claim_failed` | snapshot was `PENDING` but the atomic claim matched no rows (lost race) |

Execution-level audits remain unchanged: `WORKFLOW_EXECUTION_PROCESS_STARTED`,
`WORKFLOW_EXECUTION_PROCESS_COMPLETED`, `WORKFLOW_EXECUTION_PROCESS_FAILED`,
`WORKFLOW_EXECUTION_PROCESS_TECHNICAL_FAILURE`, `WORKFLOW_EXECUTION_PROCESS_SKIPPED`.

## Residual risks (known)

These are **not** solved by this sprint and are accepted as known limitations:

- **Crash after the Jira response and before persisting output.** If the worker
  dies between Jira returning success and `updateStatus(COMPLETED)` persisting
  the output, there is no local signal. The step stays `RUNNING`, is not
  re-claimable, and the execution is left for the stale-running recovery. The
  external effect already happened but is not recorded locally.
- **Blind transition retry without persisted output.** Without a persisted
  output, a transition retry still goes through the handler. If the issue has
  already moved to another status, Jira typically rejects the old
  `transitionId` (HTTP 400 -> business failure -> `FAILED`), which can be a
  false negative. GovFlow does **not** mask this as success without evidence.
- **Stuck RUNNING steps depend on recovery.** A step left `RUNNING` by a hard
  crash is resolved by the stale-running recovery
  (`WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES`), not by an immediate retry.

## Out of scope

The following were intentionally **not** implemented in this sprint:

- remote dedup against Jira;
- querying existing Jira comments / issue status / available transitions;
- rollback of an applied Jira transition;
- Jira webhooks;
- Jira OAuth.

## Explicit note

This sprint implements **local idempotency based on persisted output**. It is a
strong reduction of duplicate Jira side effects under retries and concurrency,
but it is **not absolute exactly-once delivery against Jira**: the residual
risks above remain until a future phase adds remote dedup or persistence closer
to the Jira call.
