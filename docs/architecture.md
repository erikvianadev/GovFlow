# GovFlow Backend Architecture

## Current Architecture

The backend follows a layered architecture:

```txt
HTTP Request
  -> Route
  -> Middleware
  -> Controller
  -> Service
  -> Repository
  -> PostgreSQL
```

## Layers

### Routes

Routes define endpoint paths, connect controllers, and declare access policies.
Nested routes are used where the URL expresses ownership, such as workflow
steps and workflow execution creation.

### Controllers

Controllers handle HTTP-specific logic:

- Read params, query strings, and request bodies.
- Call services.
- Return standardized responses.

Controllers should not contain SQL or complex application rules.

### Services

Services contain application rules:

- Validate input.
- Normalize data and filters.
- Limit pagination.
- Coordinate repositories.
- Hash and compare passwords.
- Generate access tokens.
- Check resource existence and active status.
- Register audit logs through `safeRegisterAuditLog`.

### Repositories

Repositories are responsible for database access. They contain parameterized
SQL queries and return database results.

### Validators

Validators check input format before data reaches database operations.

### Middlewares

Middlewares handle cross-cutting concerns:

- CORS
- JSON parsing
- Request logging
- JWT authentication
- Role-based authorization
- 404 not found responses
- Global error handling

## Current Modules

```txt
src/modules/
  audit-logs/
  auth/
  departments/
  health/
  users/
  workflows/
  workflow-steps/
  workflow-executions/
  workflow-execution-steps/
  workflow-processing/
```

### Health Module

Checks API and database status and records each health check as an audit log.

### Audit Logs Module

Lists, filters, and creates audit logs.

### Departments Module

Lists, filters, retrieves, and creates departments.

### Users Module

Lists, filters, retrieves, and creates users. User creation hashes passwords
before persistence.

### Auth Module

Authenticates users, issues access tokens, returns the authenticated user, and
exposes an ADMIN-only route used to validate authorization behavior.

### Workflows Module

Defines the workflow process. A workflow can be associated with a department
and creator, can be listed with filters, and is created by ADMIN or MANAGER.

### Workflow Steps Module

Defines ordered steps that belong to a workflow.

Important rules:

- `workflow_id` is required.
- `step_order` must be positive.
- `(workflow_id, step_order)` is unique.
- `action_type` is controlled.
- `configuration` is stored as JSONB.
- steps are listed by `step_order ASC`.

### Workflow Executions Module

Records each time a workflow is started and creates the execution step
instances for that run.

Important rules:

- `workflow_id` is required.
- `started_by` comes from `req.user.id`.
- new executions start as `PENDING`.
- `input` is optional JSONB.
- `result`, `started_at`, and `completed_at` are initially nullable.
- the workflow must exist and be active.
- the workflow must have at least one active step.
- execution step creation happens in the same transaction as execution
  creation.

### Workflow Execution Steps Module

Lists the step instances generated for a workflow execution.

Important rules:

- `execution_id` is required.
- `step_id` is required.
- new execution steps start as `PENDING`.
- steps are listed by source workflow `step_order ASC`.
- response includes step metadata such as `action_type` and `configuration`.

### Workflow Processing Module

Queues pending workflow executions and processes them asynchronously through a
worker.

Important rules:

- `POST /workflow-executions/:id/process` is the official async processing endpoint.
- `POST /workflow-executions/:id/enqueue` remains as a temporary alias.
- only `PENDING` executions can be queued.
- the API adds a BullMQ job and returns `202 Accepted` with status `QUEUED`.
- the worker consumes jobs from Redis.
- the worker calls the internal workflow processor.
- `GET /workflow-executions/:id/job` exposes queue job state for observability.
- execution status moves to `RUNNING` before step processing.
- steps are processed in `step_order ASC`.
- successful steps move to `COMPLETED`.
- failed steps move to `FAILED` and persist `error_message`.
- previous steps remain `COMPLETED`.
- later steps remain `PENDING`.
- execution ends as `COMPLETED` or `FAILED`.
- stale `RUNNING` executions can be recovered by an ADMIN endpoint or manual
  script.

## Workflow Domain Model

Sprint 4 introduced the workflow processing foundation:

```txt
Workflow
+-- WorkflowStep
+-- WorkflowExecution
    +-- WorkflowExecutionStep
```

Conceptually:

- `Workflow` is the process definition.
- `WorkflowStep` is an ordered action in that process.
- `WorkflowExecution` is one real instance of starting that process.
- `WorkflowExecutionStep` is one real instance of a step inside an execution.

Current execution flow:

```txt
POST /workflows/:workflowId/executions
  -> Authenticate user
  -> Authorize ADMIN, MANAGER, or OPERATOR
  -> Validate workflowId
  -> Validate input
  -> Load workflow
  -> Reject missing or inactive workflow
  -> Reject workflow without active steps
  -> BEGIN
  -> Insert workflow_execution with status PENDING
  -> Load active workflow_steps
  -> Insert workflow_execution_steps with status PENDING
  -> COMMIT
  -> Register WORKFLOW_EXECUTION_CREATED audit log with executionStepsCount
  -> Return created execution with execution_steps_count
```

Processing flow:

```txt
POST /workflow-executions/:id/process
  -> Validate execution
  -> Ensure execution is PENDING
  -> Add workflow processing job to BullMQ
  -> Return 202 Accepted with status QUEUED
  -> Worker consumes job
  -> Worker calls workflowProcessor.service
  -> Load workflow_execution_steps
  -> Set execution RUNNING
  -> For each step ordered by step_order ASC:
       set step RUNNING
       execute action handler
       set step COMPLETED or FAILED
  -> Set execution COMPLETED or FAILED
```

## Workflow Processing Architecture

GovFlow uses asynchronous workflow processing as the public API contract.

Architecture:

```txt
Client
  -> API
  -> BullMQ Queue
  -> Redis
  -> Worker
  -> Workflow Processor
  -> PostgreSQL
```

Queue observability:

```txt
GET /workflow-executions/:id/job
  -> Validate execution
  -> Ensure workflow_execution exists
  -> Build job ID workflow-execution-<executionId>
  -> Read BullMQ job
  -> Return waiting | active | completed | failed | delayed | paused | not_found
```

Completed jobs are retained in the queue so the API can report `completed`
instead of immediately returning `not_found`.

## Retry Strategy

GovFlow distinguishes business failures from technical failures.

Business failures are expected workflow outcomes, such as a step failing
validation. They mark the workflow execution as `FAILED` and fail the BullMQ job
with `UnrecoverableError`, so BullMQ does not retry the job unnecessarily.

Technical failures are unexpected infrastructure or runtime errors. They are
thrown as normal errors so BullMQ can retry the job according to the queue
configuration.

Current retry strategy:

- attempts: 3
- backoff: exponential
- delay: 3000ms
- removeOnComplete: false
- removeOnFail: false

The public job status endpoint exposes retry counters and failure reason, but
does not expose job stacktraces.

Current creation flow:

```txt
POST /workflows/:workflowId/executions
  -> Validate workflow
  -> Create workflow_execution
  -> Load active workflow_steps
  -> Create workflow_execution_steps
  -> Return execution with execution_steps_count
```

Current processing flow:

```txt
POST /workflow-executions/:id/process
  -> Validate execution
  -> Ensure execution is PENDING
  -> Enqueue workflow-processing job
  -> Return 202 Accepted
  -> Worker receives job
  -> Load workflow_execution_steps
  -> Set execution RUNNING
  -> For each step ordered by step_order ASC:
       set step RUNNING
       execute action handler
       set step COMPLETED or FAILED
  -> Set execution COMPLETED or FAILED
```

## Worker Recovery

GovFlow detects workflow executions that were claimed by a worker but stayed
`RUNNING` longer than `WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES`.

Recovery flow:

```txt
RUNNING execution older than timeout
  -> Mark RUNNING execution steps as FAILED
  -> Preserve previously COMPLETED steps
  -> Preserve later PENDING steps
  -> Mark execution as FAILED
  -> Set result.recoveryReason = "Execution timed out while running"
  -> Register WORKFLOW_EXECUTION_RECOVERY_FAILED audit log
```

Recovery can be triggered through:

```txt
POST /workflow-executions/recovery/stale-running
npm run workflow:recover-stale
```

The endpoint is ADMIN-only. The script uses the same service path and is meant
for manual operational recovery.

## Workflow Step Handlers

Workflow step processing is currently simulated through internal handlers.

Supported action types:

```txt
MANUAL
NOTIFICATION
JIRA_TRANSITION
JIRA_COMMENT
```

Current behavior:

| Action Type | Current Behavior |
| --- | --- |
| MANUAL | Simulated completion |
| NOTIFICATION | Simulated completion |
| JIRA_TRANSITION | Simulated completion |
| JIRA_COMMENT | Simulated completion |

No external systems are called yet.

## Workflow Failure Handling

The processor supports controlled step failures using step configuration.

Example:

```json
{
  "shouldFail": true,
  "failureMessage": "Simulated processor failure"
}
```

When a step fails:

```txt
Current step -> FAILED
Current step error_message -> error message
Previous steps -> remain COMPLETED
Next steps -> remain PENDING
Execution -> FAILED
Execution result.failedStep -> failure details
Audit log -> WORKFLOW_EXECUTION_PROCESS_FAILED
```

A controlled workflow failure is not treated as an API error. The API returns
HTTP `200` with execution status `FAILED`.

## Transaction Strategy

GovFlow supports database transactions through `database.transaction`.

This is used when creating workflow executions and their execution steps.

Creation flow:

```txt
BEGIN
  create workflow_execution
  load active workflow_steps
  create workflow_execution_steps
COMMIT
```

If any operation fails:

```txt
ROLLBACK
```

This prevents orphaned workflow executions without execution steps.

The workflow processor does not use one long transaction for the entire
processing flow.

Reasons:

- processing status should remain traceable
- failed steps should stay persisted
- long transactions are not suitable for future external calls
- future Jira/email/webhook calls should not happen inside a database
  transaction

## Authentication Architecture

GovFlow uses JWT-based authentication.

Login flow:

```txt
POST /auth/login
  -> Validate payload
  -> Find user by email
  -> Check active status
  -> Compare password with bcrypt
  -> Generate JWT access token
  -> Register LOGIN_SUCCESS or LOGIN_FAILED
  -> Return safe user data and access token
```

Protected route flow:

```txt
Request with Authorization header
  -> authMiddleware
  -> Validate Bearer token format
  -> Verify JWT
  -> Validate token subject
  -> Find user by token subject
  -> Check active status
  -> Populate req.user
  -> Route handler
```

## Authorization Architecture

GovFlow currently uses simple role-based access control.

Roles:

```txt
ADMIN
MANAGER
OPERATOR
```

Authorization flow:

```txt
Protected request
  -> authMiddleware
  -> req.user populated
  -> roleMiddleware(["ALLOWED_ROLE"])
  -> Check req.user.role
  -> Allow or reject request
```

Current route access policy:

| Resource | ADMIN | MANAGER | OPERATOR |
| --- | ---: | ---: | ---: |
| Users | yes | no | no |
| Departments read | yes | yes | no |
| Departments create | yes | no | no |
| Audit logs read | yes | yes | no |
| Audit logs create | yes | no | no |
| Workflows read | yes | yes | no |
| Workflows create | yes | yes | no |
| Workflow steps read | yes | yes | no |
| Workflow steps create | yes | yes | no |
| Workflow executions create | yes | yes | yes |
| Workflow executions read | yes | yes | no |
| Workflow execution steps read | yes | yes | no |
| Workflow processing | yes | yes | no |
| Workflow stale recovery | yes | no | no |

OPERATOR can start workflow executions because that role represents operational
users who trigger processes. OPERATOR cannot administer workflows, define
steps, or list executions globally.

## Database

The current database is PostgreSQL.

### departments

Stores administrative departments.

Important fields:

```txt
id
name
description
is_active
created_at
updated_at
```

### users

Stores users and their administrative role.

Important fields:

```txt
id
name
email
password_hash
role
department_id
is_active
created_at
updated_at
```

### audit_logs

Stores system and business events.

Important fields:

```txt
id
action
entity
entity_id
actor_id
metadata
created_at
```

### workflows

Stores workflow definitions.

Important fields:

```txt
id
name
description
department_id
created_by
is_active
created_at
updated_at
```

### workflow_steps

Stores ordered workflow step definitions.

Important fields:

```txt
id
workflow_id
name
description
step_order
action_type
configuration
is_active
created_at
updated_at
```

Important constraints and indexes:

```txt
workflow_id -> workflows(id) ON DELETE CASCADE
UNIQUE (workflow_id, step_order)
idx_workflow_steps_workflow_id
idx_workflow_steps_action_type
idx_workflow_steps_is_active
idx_workflow_steps_workflow_order
```

### workflow_executions

Stores workflow execution instances.

Important fields:

```txt
id
workflow_id
started_by
status
input
result
started_at
completed_at
created_at
updated_at
```

Important constraints and indexes:

```txt
workflow_id -> workflows(id) ON DELETE CASCADE
started_by -> users(id) ON DELETE SET NULL
status IN (PENDING, RUNNING, COMPLETED, FAILED, CANCELED)
idx_workflow_executions_workflow_id
idx_workflow_executions_started_by
idx_workflow_executions_status
idx_workflow_executions_created_at
idx_workflow_executions_workflow_status
```

### workflow_execution_steps

Stores step instances for each workflow execution.

Important fields:

```txt
id
execution_id
step_id
status
started_at
completed_at
error_message
created_at
updated_at
```

Important constraints and indexes:

```txt
execution_id -> workflow_executions(id) ON DELETE CASCADE
step_id -> workflow_steps(id) ON DELETE CASCADE
status IN (PENDING, RUNNING, COMPLETED, FAILED, SKIPPED)
UNIQUE (execution_id, step_id)
idx_workflow_execution_steps_execution_id
idx_workflow_execution_steps_step_id
idx_workflow_execution_steps_status
idx_workflow_execution_steps_execution_status
```

### schema_migrations

Stores executed migration filenames. This prevents running the same migration
multiple times.

Current migrations:

```txt
001_create_audit_logs.sql
002_create_departments.sql
003_create_users.sql
004_create_workflows.sql
005_create_workflow_steps.sql
006_create_workflow_executions.sql
007_create_workflow_execution_steps.sql
```

## Audit Architecture

Audit logs capture security, administrative, and workflow-domain events.

Current automatic events:

```txt
HEALTH_CHECK_EXECUTED
LOGIN_SUCCESS
LOGIN_FAILED
DEPARTMENT_CREATED
USER_CREATED
WORKFLOW_CREATED
WORKFLOW_STEP_CREATED
WORKFLOW_EXECUTION_CREATED
WORKFLOW_EXECUTION_PROCESS_STARTED
WORKFLOW_EXECUTION_PROCESS_COMPLETED
WORKFLOW_EXECUTION_PROCESS_FAILED
WORKFLOW_EXECUTION_RECOVERY_FAILED
```

Audit registration in domain services uses `safeRegisterAuditLog`, so a failure
to write an audit log does not break the primary business operation.

## Security Decisions

### Password Hashing

Passwords are never stored in plain text.

User creation flow:

```txt
password
  -> bcrypt.hash()
  -> password_hash stored in database
```

The API never returns `password` or `password_hash`.

### JWT

JWT access tokens include:

```txt
sub
email
role
```

`sub` represents the authenticated user ID. Tokens have configurable expiration
through `JWT_EXPIRES_IN`.

### User Status Validation

Even when a JWT is cryptographically valid, protected routes fetch the user
from the database and verify `is_active`.

This allows the system to block inactive users even if they still have a valid
token.

### Error Handling

Invalid email and invalid password return the same message:

```txt
Invalid email or password
```

This avoids leaking whether an email exists in the system.

## API Response Standard

Success:

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": []
}
```

Paginated:

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "data": [],
  "pagination": {}
}
```

## Tests

The current automated tests cover:

- migration file contracts
- validators
- repository filter builders
- route registration and route ordering
- transaction helper behavior
- execution step repository behavior
- workflow processor service behavior
- workflow step handler behavior
- controlled workflow processing failures
- stale `RUNNING` execution recovery

Useful commands:

```bash
npm test
docker exec govflow_api npm test
docker exec govflow_api npm run db:migrate
```

Manual validation also covered Docker migrations, HTTP scenarios for workflow
execution creation, execution step listing, asynchronous processing through the
worker, controlled failures, RBAC, filters, lookup by ID, and audit log
creation.

## Current Trade-offs

### SQL Instead of ORM

The project currently uses raw SQL with `pg`.

Reasons:

- Better understanding of SQL and database access.
- Less abstraction during the foundation phase.
- Direct control over migrations, constraints, and indexes.

Prisma may be introduced later.

### Manual Validation

The project currently uses manual validators.

Reasons:

- Understand validation fundamentals.
- Avoid dependencies before they are needed.

A schema validation library such as Zod may be introduced later.

### Database Lookup on Each Protected Request

Protected routes fetch the authenticated user from the database on every
request.

Reasons:

- Simple implementation.
- Ensures inactive users are blocked immediately.
- Avoids trusting stale token data.

Future evolution:

- Short-lived user cache.
- Token versioning.
- Redis-backed session or revocation strategy.

### Asynchronous Workflow Processing

Workflow processing is exposed as an asynchronous API contract.

Reasons:

- Avoid long-running work inside the API request lifecycle.
- Keep `/process` focused on the business intent while BullMQ and Redis handle
  execution handoff.
- Keep processing rules centralized in `workflowProcessor.service`, which is
  called by the worker.

Trade-offs:

- Clients must poll `GET /workflow-executions/:id` and
  `GET /workflow-executions/:executionId/steps` for progress.
- Clients must trigger recovery through the ADMIN endpoint or manual script;
  automatic scheduled recovery is not implemented yet.

Future evolution:

- Automatic scheduled recovery
- Jira transition/comment integration
- Notification dispatch
- Step execution logs

### Console Logging

The project currently uses `console.log` for request logging.

Reasons:

- Simple development observability.
- No premature logging infrastructure.

A structured logger or OpenTelemetry may be introduced later.

## Future Architecture Evolution

Planned improvements:

```txt
TypeScript
Prisma
Redis
BullMQ
Background jobs
Retry strategy
RUNNING execution recovery
Jira integration
Workflow execution step logs
Domain events
Frontend dashboard
Deployment pipeline
```

## Future Processing Evolution

The public processing contract is asynchronous. The processor remains an
internal service used by the worker.

Future evolution:

```txt
API /process
  -> BullMQ
  -> Worker
  -> Processor service
  -> Retry strategy
  -> Jira integration
  -> Step execution logs
```

The current implementation proves the queue-to-worker lifecycle before adding
production retry, timeout recovery, and external integrations.
