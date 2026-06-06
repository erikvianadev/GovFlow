# Sprint 3 - Workflow Domain Foundation

## Summary

This PR adds the initial workflow domain foundation to GovFlow.

The backend can now model workflow definitions, ordered workflow steps, and
workflow execution records:

```txt
Workflow
+-- WorkflowStep
+-- WorkflowExecution
```

Workflow execution creation intentionally records a `PENDING` execution only.
It does not process steps, call Jira, send notifications, or use background
workers yet. That processing layer is deferred to a future sprint.

## What Changed

### Workflows

- Added `workflows` migration.
- Added workflows module with routes, controller, service, repository, and
  validator.
- Added endpoints to create, list, and fetch workflows.
- Added filters for department, creator, and active status.
- Added `WORKFLOW_CREATED` audit log event.

### Workflow Steps

- Added `workflow_steps` migration.
- Added workflow steps module with nested routes under workflows.
- Added ordered step creation and listing.
- Enforced unique `step_order` per workflow.
- Added controlled action types:
  - `MANUAL`
  - `JIRA_TRANSITION`
  - `JIRA_COMMENT`
  - `NOTIFICATION`
- Stored `configuration` as JSONB.
- Added `WORKFLOW_STEP_CREATED` audit log event.

### Workflow Executions

- Added `workflow_executions` migration.
- Added workflow executions module with nested creation route and global read
  routes.
- Added execution creation with status `PENDING`.
- Stored execution `input` as JSONB.
- Set `started_by` from the authenticated user.
- Added list filters for workflow, starter, and status.
- Added `WORKFLOW_EXECUTION_CREATED` audit log event.

### RBAC

- `ADMIN` and `MANAGER` can create and read workflows.
- `ADMIN` and `MANAGER` can create and read workflow steps.
- `ADMIN`, `MANAGER`, and `OPERATOR` can start workflow executions.
- `ADMIN` and `MANAGER` can list and read workflow executions.
- `OPERATOR` cannot administer workflows or list executions globally.

### Documentation

- Updated `README.md`.
- Updated `docs/api.md`.
- Updated `docs/architecture.md`.
- Added this Sprint 3 PR description draft.

## New Endpoints

```txt
GET  /workflows
GET  /workflows/:id
POST /workflows

GET  /workflows/:workflowId/steps
POST /workflows/:workflowId/steps

POST /workflows/:workflowId/executions
GET  /workflow-executions
GET  /workflow-executions/:id
```

## New Migrations

```txt
004_create_workflows.sql
005_create_workflow_steps.sql
006_create_workflow_executions.sql
```

## New Audit Events

```txt
WORKFLOW_CREATED
WORKFLOW_STEP_CREATED
WORKFLOW_EXECUTION_CREATED
```

## Validation Coverage

The implementation validates:

- workflow creation payloads
- workflow list filters
- workflow IDs
- workflow step creation payloads
- workflow step ordering
- workflow step action types
- workflow step JSON configuration
- workflow execution creation payloads
- workflow execution list filters
- workflow execution statuses
- workflow execution IDs

## Testing

Automated tests cover:

- migration contracts
- validators
- repository filter builders
- nested and global route registration
- route ordering

Manual validation covered:

- migrations in Docker
- idempotent migration reruns
- workflow execution creation with ADMIN, MANAGER, and OPERATOR
- unauthorized and forbidden cases
- invalid workflow IDs
- missing workflows
- invalid input payloads
- execution listing
- execution filters
- execution lookup by ID
- audit log creation for workflow executions

Latest validation:

```txt
npm test
docker exec govflow_api npm test
docker exec govflow_api npm run db:migrate
```

## Design Notes

Workflow execution is deliberately split from workflow processing.

Current behavior:

```txt
POST /workflows/:workflowId/executions
  -> create workflow_execution with PENDING status
  -> write audit log
  -> return execution
```

Future behavior can add:

```txt
queue
worker
step execution logs
Jira transitions
Jira comments
notifications
retry strategy
execution result aggregation
```

This keeps the domain contract stable before introducing automation side
effects.
