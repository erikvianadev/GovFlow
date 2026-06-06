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

Records each time a workflow is started.

Important rules:

- `workflow_id` is required.
- `started_by` comes from `req.user.id`.
- new executions start as `PENDING`.
- `input` is optional JSONB.
- `result`, `started_at`, and `completed_at` are initially nullable.
- the workflow must exist and be active.

Workflow executions are intentionally not processed yet. The current module
creates the execution contract only; step processing, Jira calls,
notifications, retries, and background workers are future concerns.

## Workflow Domain Model

Sprint 3 introduced the initial workflow domain:

```txt
Workflow
+-- WorkflowStep
+-- WorkflowExecution
```

Conceptually:

- `Workflow` is the process definition.
- `WorkflowStep` is an ordered action in that process.
- `WorkflowExecution` is one real instance of starting that process.

Current execution flow:

```txt
POST /workflows/:workflowId/executions
  -> Authenticate user
  -> Authorize ADMIN, MANAGER, or OPERATOR
  -> Validate workflowId
  -> Validate input
  -> Load workflow
  -> Reject missing or inactive workflow
  -> Insert workflow_execution with status PENDING
  -> Register WORKFLOW_EXECUTION_CREATED audit log
  -> Return created execution
```

Deferred execution processing:

```txt
PENDING execution
  -> future queue or worker
  -> load workflow steps
  -> run step actions
  -> persist step-level logs
  -> update execution status/result
```

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

Useful commands:

```bash
npm test
docker exec govflow_api npm test
docker exec govflow_api npm run db:migrate
```

Manual validation during Sprint 3 also covered Docker migrations and HTTP
scenarios for workflow execution creation, RBAC, filters, lookup by ID, and
audit log creation.

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

### No Workflow Processing Yet

Workflow execution creation currently persists a `PENDING` execution only.

Reasons:

- Establish the domain contract before adding automation side effects.
- Keep API behavior deterministic while modeling the workflow domain.
- Leave room for queues, workers, retries, and step-level logs.

Future evolution:

- Synchronous prototype processor.
- BullMQ or another queue.
- Dedicated worker process.
- Jira transition/comment integration.
- Notification dispatch.
- Step execution logs.

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
Jira integration
Redis
BullMQ
Background jobs
Workflow execution step logs
Domain events
Frontend dashboard
Deployment pipeline
```
