# Jira Idempotency & Step-Level Concurrency

This document describes how GovFlow avoids duplicating external Jira side
effects (comments and transitions) when a workflow execution is retried, fails
partially, or runs concurrently with recovery. It reflects Sprint 6.4.2
(local, persisted-output idempotency) and Sprint 6.4.3 (remote-assisted
recovery for `JIRA_COMMENT`).

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

### 7. Remote-assisted recovery for JIRA_COMMENT (Sprint 6.4.3)

Layers 1–6 are **local**: they depend on output GovFlow managed to persist. They
do nothing for the worst residual case — the worker created the Jira comment and
then crashed **before** persisting any output, leaving the step stuck `RUNNING`.
Local state has no record of the side effect, so the stale-running recovery would
record a false `FAILED`.

Sprint 6.4.3 adds a **read-only, best-effort** remote check, scoped to
`JIRA_COMMENT` only. GovFlow embeds a stable marker in every comment it creates:

```txt
GovFlow executionStepId: <executionStepId>
```

The marker text is produced by a single source of truth
(`jiraService.buildExecutionStepMarker`) used both when writing the comment
(`workflowStepHandlers.buildGovFlowJiraComment`) and when searching for it during
recovery, so the two can never drift apart.

When the stale-running recovery finds a `RUNNING` `JIRA_COMMENT` step, before
finalizing it as `FAILED` it asks Jira (read-only) whether a comment carrying
that step's marker already exists:

- The lookup (`jiraService.findCommentByExecutionStepMarker`) lists the issue's
  comments most-recent first, paginated (50 per page, **capped at 3 pages**),
  flattening each comment's ADF body to plain text to locate the marker.
- It **runs before the recovery transaction** — a slow or unreachable Jira never
  holds a database transaction open.
- It **never throws**: Jira disabled, misconfigured, unreachable, or returning an
  error all resolve to "could not verify", which falls back to the existing safe
  default (`FAILED`). The result is therefore never *worse* than before 6.4.3.
- If a matching comment is found, the step is corrected to `COMPLETED` (with a
  reconstructed output carrying `recoveredViaRemoteLookup: true`) **inside the
  same recovery transaction** that just exclusively locked the row.
- The execution itself is **always** finalized `FAILED` regardless — this sprint
  corrects only step-level truth (so a future retry/admin-reprocess never
  duplicates the comment); it does not resurrect a timed-out execution to
  `COMPLETED`.

`JIRA_TRANSITION` is **not** covered: a transition carries no free-text marker,
so there is no equivalent remote evidence. It remains a documented residual risk.

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

### Recovery audit events (Sprint 6.4.3)

The stale-running recovery emits, per recovered execution:

| action | meaning |
| --- | --- |
| `WORKFLOW_EXECUTION_RECOVERY_FAILED` | the execution was finalized `FAILED` by the recovery (always emitted; carries `failedRunningStepsCount` and `recoveredRunningStepsCount`) |
| `WORKFLOW_EXECUTION_STEP_RECOVERED_VIA_JIRA_LOOKUP` | a `RUNNING` `JIRA_COMMENT` step was confirmed via the remote lookup and corrected to `COMPLETED` instead of `FAILED` (one per recovered step) |

`WORKFLOW_EXECUTION_STEP_RECOVERED_VIA_JIRA_LOOKUP` is distinct from
`WORKFLOW_EXECUTION_STEP_SKIPPED`: the latter is a processor-time idempotent skip
based on **local** persisted output; the former is a recovery-time correction
based on **remote** evidence that the comment exists despite no local output.

## Residual risks (known)

These are **not** solved by this sprint and are accepted as known limitations:

- **Crash after the Jira response and before persisting output — `JIRA_COMMENT`
  (partially mitigated since 6.4.3).** If the worker dies between Jira returning
  success and `updateStatus(COMPLETED)` persisting the output, there is no local
  signal. The step stays `RUNNING` for the stale-running recovery. Sprint 6.4.3
  mitigates this for comments with a **best-effort** remote marker lookup: when
  Jira is enabled and reachable, the recovery corrects the step to `COMPLETED`
  instead of a false `FAILED`. This is not a guarantee — if Jira is disabled,
  unreachable, or the comment is beyond the 3-page lookup cap, the step still
  falls back to `FAILED`.
- **Crash after the Jira response and before persisting output — `JIRA_TRANSITION`
  (unmitigated).** A transition carries no free-text marker, so there is no
  remote evidence to look up. The step stays `RUNNING` and the recovery records
  it `FAILED`; the external effect already happened but is not recorded locally.
- **Blind transition retry without persisted output.** Without a persisted
  output, a transition retry still goes through the handler. If the issue has
  already moved to another status, Jira typically rejects the old
  `transitionId` (HTTP 400 -> business failure -> `FAILED`), which can be a
  false negative. GovFlow does **not** mask this as success without evidence.
- **Stuck RUNNING steps depend on recovery.** A step left `RUNNING` by a hard
  crash is resolved by the stale-running recovery
  (`WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES`), not by an immediate retry.

## Out of scope

The following were intentionally **not** implemented:

- remote dedup at **processing** time (the 6.4.3 lookup is recovery-only and
  read-only; the processor still relies on local persisted-output idempotency);
- querying issue status / available transitions to verify a `JIRA_TRANSITION`
  (would require persisting the expected target status to tell "already applied"
  from a real failure — out of scope);
- rollback of an applied Jira transition;
- Jira webhooks;
- Jira OAuth.

Querying existing Jira comments is now implemented, but **only for recovery** of
`JIRA_COMMENT` steps (see layer 7).

## Explicit note

Sprint 6.4.2 implements **local idempotency based on persisted output**. It is a
strong reduction of duplicate Jira side effects under retries and concurrency,
but it is **not absolute exactly-once delivery against Jira**.

Sprint 6.4.3 adds a **remote-assisted, best-effort** recovery check for
`JIRA_COMMENT` only, narrowing (but not eliminating) the worst residual case —
a comment created right before a crash being recorded as a false `FAILED`. It is
read-only, recovery-time, and bounded; it is still not exactly-once delivery, and
`JIRA_TRANSITION` remains unmitigated.
