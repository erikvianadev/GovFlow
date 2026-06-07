# Sprint 4 - Workflow Processing Foundation

## Summary

This PR adds the workflow processing foundation to GovFlow.

The backend can now create step-level execution records and process workflow
executions synchronously:

```txt
Workflow
+-- WorkflowStep
+-- WorkflowExecution
    +-- WorkflowExecutionStep
        -> synchronous processor
```

The processor is intentionally synchronous and simulated. It does not use
Redis, BullMQ, background workers, Jira, email, or webhooks yet.

## What Changed

### Workflow Execution Steps

- Added `workflow_execution_steps` migration.
- Added step-level execution tracking.
- Added statuses:
  - `PENDING`
  - `RUNNING`
  - `COMPLETED`
  - `FAILED`
  - `SKIPPED`
- Added relationships:
  - `execution_id -> workflow_executions(id)`
  - `step_id -> workflow_steps(id)`
- Added indexes for execution, step, status, and execution/status lookups.

### Execution Creation

- Creating a workflow execution now also creates execution steps.
- Only active workflow steps are copied into execution steps.
- Workflows without active steps are rejected.
- Execution creation and execution step creation run in one database
  transaction.
- `WORKFLOW_EXECUTION_CREATED` audit metadata now includes
  `executionStepsCount`.

### Workflow Execution Step API

- Added endpoint to list execution steps:

```txt
GET /workflow-executions/:executionId/steps
```

- Access is limited to `ADMIN` and `MANAGER`.
- Response includes step details needed by the processor:
  - `step_order`
  - `action_type`
  - `configuration`
  - execution step status and timestamps

### Synchronous Workflow Processor

- Added synchronous processor endpoint:

```txt
POST /workflow-executions/:id/process
```

- Access is limited to `ADMIN` and `MANAGER`.
- Processor behavior:
  - validates execution ID
  - requires execution status `PENDING`
  - loads execution steps
  - marks execution `RUNNING`
  - processes steps in `step_order ASC`
  - marks steps `RUNNING`
  - marks successful steps `COMPLETED`
  - marks execution `COMPLETED` when all steps succeed

### Step Handlers

- Added simulated internal handlers for:
  - `MANUAL`
  - `NOTIFICATION`
  - `JIRA_TRANSITION`
  - `JIRA_COMMENT`

No external systems are called yet.

### Failure Handling

- Added controlled failure support through step configuration:

```json
{
  "shouldFail": true,
  "failureMessage": "Simulated processor failure"
}
```

- When a step fails:
  - previous steps remain `COMPLETED`
  - failing step becomes `FAILED`
  - failing step stores `error_message`
  - later steps remain `PENDING`
  - execution becomes `FAILED`
  - execution result stores `failedStep`
  - API returns HTTP `200` with business status `FAILED`

### Audit Events

Added processing audit events:

```txt
WORKFLOW_EXECUTION_PROCESS_STARTED
WORKFLOW_EXECUTION_PROCESS_COMPLETED
WORKFLOW_EXECUTION_PROCESS_FAILED
```

## New Endpoints

```txt
GET  /workflow-executions/:executionId/steps
POST /workflow-executions/:id/process
```

## New Migration

```txt
007_create_workflow_execution_steps.sql
```

## Testing

Automated tests cover:

- migration contracts
- validators
- repository helpers
- transaction helper behavior
- route registration and ordering
- execution step listing service
- workflow processor service
- simulated step handlers
- controlled processing failures

Manual validation covered:

- Docker migrations
- idempotent migration reruns
- execution creation with execution steps
- execution step listing with ADMIN and MANAGER
- OPERATOR access denied for execution step listing and processing
- synchronous processing success
- controlled processing failure
- failed step persistence
- later steps remaining `PENDING`
- audit logs for started, completed, and failed processing

Latest validation:

```txt
npm test
docker exec govflow_api npm test
docker exec govflow_api npm run db:migrate
```

## Design Notes

### Why Synchronous First

Sprint 4 proves the workflow lifecycle before adding queue infrastructure.

Current lifecycle:

```txt
PENDING
  -> RUNNING
  -> COMPLETED or FAILED
```

This makes the processing contract clear before introducing Redis, BullMQ,
workers, retries, and Jira integration.

### Transaction Strategy

Execution creation uses a transaction to avoid orphaned executions without
execution steps.

Workflow processing does not use one long transaction.

Reason:

- failed steps must remain persisted
- status transitions should be traceable
- future external calls should not happen inside a database transaction
- long transactions are not appropriate for Jira/email/webhook work

### Future Work

Sprint 5 should focus on asynchronous processing foundations:

```txt
Redis
BullMQ
Background workers
Retry strategy
Job status tracking
RUNNING execution recovery
Preparation for Jira integration
```
