# GovFlow Backend

GovFlow is a backend API for administrative workflow automation. It is being
built incrementally with a focus on maintainable domain modeling, PostgreSQL
foundations, auditability, authentication, authorization, and future automation
integrations such as Jira.

## Current Status

Sprint 6.4.2 - Jira Idempotency & Step-Level Concurrency completed.

GovFlow processes workflow executions asynchronously and integrates with the
real Jira Cloud REST API for `JIRA_COMMENT` and `JIRA_TRANSITION` steps. Recent
sprints added security hardening (6.4.1) and step-level idempotency to avoid
duplicate external Jira side effects under retries and concurrency (6.4.2).

The current backend includes:

- Express API structure
- PostgreSQL database
- Redis infrastructure
- BullMQ workflow processing queue
- Dedicated background worker
- Dockerized API, worker, database, and Redis
- Environment variables with required-variable validation
- Database connection pool
- Public health check endpoint with safe degraded reporting
- Admin-only deep health check for dependency status
- Global error handling (environment-aware responses)
- Standardized API responses
- Request logging middleware
- SQL migrations and seeds
- Audit logs module
- Departments module
- Users module
- Password hashing with bcrypt and password policy
- Login endpoint (account-enumeration-safe) with per-IP rate limiting
- JWT access token generation with hardened claims
- Authentication middleware
- Role-based authorization middleware
- Object-level (department-scoped) authorization for executions
- Protected routes
- Helmet security headers, CORS allowlist, and trust-proxy-aware rate limiting
- Workflows module
- Workflow steps module
- Workflow executions module
- Workflow execution steps module
- Real Jira integration (connection test, JIRA_COMMENT, JIRA_TRANSITION)
- Transaction support for multi-step database operations
- Asynchronous workflow processor (queued via BullMQ, run by the worker)
- Atomic PENDING -> RUNNING claim at the execution and step level
- Retryable step failures revert the step to PENDING (only the failed step retries)
- Per-step external operation output (JSONB) with a deterministic idempotencyKey
- Local deduplication of JIRA_COMMENT and JIRA_TRANSITION on retry
- Guarded terminal transitions to prevent lost updates
- Job status observability endpoint
- Retry strategy with exponential backoff
- Business failure vs technical failure handling
- Stale RUNNING execution recovery (endpoint + script)
- Workflow status lifecycle
- Step-level execution tracking
- Failure handling for workflow processing
- Pagination and filters
- Input validation
- Automated tests

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Redis
- BullMQ
- Docker
- Docker Compose
- JavaScript
- bcrypt
- JSON Web Token
- Helmet
- express-rate-limit
- axios (Jira HTTP client)

## Project Structure

```txt
scripts/
  runMigrations.js
  runSeeds.js
src/
  config/
  database/
    migrations/
    seeds/
  errors/
  middlewares/
  modules/
    audit-logs/
    auth/
    departments/
    health/
    jira/
    users/
    workflows/
    workflow-steps/
    workflow-executions/
    workflow-execution-steps/
    workflow-processing/
  routes/
  utils/
  validators/
tests/
docs/
```

Detailed architecture notes are available in
[`docs/architecture.md`](docs/architecture.md).

## Requirements

- Node.js
- Docker
- Docker Compose

## Environment Variables

Create a `.env` file based on `.env.example` when running the API locally.

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=govflow_user
DB_PASSWORD=govflow_password
DB_NAME=govflow_db

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1h

CORS_ORIGINS=http://localhost:3000

LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10

WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES=30

JIRA_RATE_LIMIT_WINDOW_MS=900000
JIRA_RATE_LIMIT_MAX=30

JIRA_ENABLED=false
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your_email@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_TIMEOUT_MS=10000
```

`JWT_SECRET` and the database variables are required at boot; the process fails
fast if they are missing. `JWT_SECRET` must be a long, private value in
production. When running with Docker Compose, the API and worker containers use
`DB_HOST=postgres` and `REDIS_HOST=redis`.

Jira is disabled by default (`JIRA_ENABLED=false`). When enabled, `JIRA_BASE_URL`,
`JIRA_EMAIL`, and `JIRA_API_TOKEN` are required for Jira steps and the connection
test.

## Running With Docker

Build and start the containers:

```bash
docker compose up --build
```

Or run in detached mode:

```bash
docker compose up --build -d
```

Expected containers:

```txt
govflow_api
govflow_worker
govflow_postgres
govflow_redis
```

The `govflow_worker` container uses the same image as the API but runs
`npm run worker:workflow-processing` to consume jobs from the
`workflow-processing` queue. See [`docs/docker-dev.md`](docs/docker-dev.md) for
development gotchas (hot reload, rebuilds after `package.json` changes, and
restarts after `.env` changes).

To run the worker outside Docker:

```bash
npm run worker:workflow-processing
```

## Database Migrations

Run migrations inside the API container:

```bash
docker exec -it govflow_api npm run db:migrate
```

Run seeds:

```bash
docker exec -it govflow_api npm run db:seed
```

Migrations are tracked in the `schema_migrations` table. Seed scripts are
idempotent and can be executed again safely.

Current migrations:

```txt
001_create_audit_logs.sql
002_create_departments.sql
003_create_users.sql
004_create_workflows.sql
005_create_workflow_steps.sql
006_create_workflow_executions.sql
007_create_workflow_execution_steps.sql
008_add_output_to_workflow_execution_steps.sql
```

## Domain Model

Sprint 4 introduced the workflow processing foundation; Sprint 5 made
processing asynchronous on top of it:

```txt
Workflow
+-- WorkflowStep
+-- WorkflowExecution
    +-- WorkflowExecutionStep
```

- `workflows` define the process.
- `workflow_steps` define ordered actions inside a workflow.
- `workflow_executions` record each time a workflow is started.
- `workflow_execution_steps` record the state of each step inside an execution.

Workflow executions now create execution steps automatically from active
workflow steps. Processing is requested through the asynchronous `/process`
endpoint, queued in BullMQ, consumed by the worker, and then reflected back in
the execution and step records as `COMPLETED` or `FAILED`.

## Workflow Processing

GovFlow processes workflow executions asynchronously and integrates with the
real Jira Cloud API.

Current processing flow:

```txt
Workflow execution created
  -> Execution steps created automatically from active workflow steps
  -> Execution starts as PENDING
  -> POST /workflow-executions/:id/process queues a BullMQ job
  -> Worker consumes the job from Redis
  -> Processor marks execution as RUNNING
  -> Processor processes execution steps in step_order ASC
  -> Each step is atomically claimed (PENDING -> RUNNING)
  -> The step handler runs (MANUAL/NOTIFICATION simulated; JIRA_* call Jira)
  -> Each successful step moves to COMPLETED and persists its output
  -> Execution moves to COMPLETED when all steps succeed
```

Step handlers:

| Action Type | Behavior |
| --- | --- |
| MANUAL | Simulated completion |
| NOTIFICATION | Simulated completion |
| JIRA_TRANSITION | Executes a real Jira issue transition |
| JIRA_COMMENT | Creates a real Jira issue comment |

The architecture rule is preserved: the worker does not know Jira; the processor
calls a handler; the handler calls the Jira integration service; the service
calls the Jira API.

Idempotency and retries:

- Steps are claimed atomically, so a retry never re-runs an already COMPLETED step.
- A retryable (technical) step failure reverts the step to PENDING so the retry
  re-claims only the failed step.
- Each step persists its external operation output (JSONB) with a deterministic
  `idempotencyKey` (`workflowExecutionStep:<stepId>`).
- If a step's persisted output proves its Jira comment/transition already
  happened, the handler (and Jira) is not called again.

This is local idempotency based on persisted output, not an absolute delivery
guarantee against Jira. See
[`docs/jira-idempotency.md`](docs/jira-idempotency.md) for the full design,
step lifecycle, audit reasons, and known residual risks.

Retry strategy:

```txt
Business failure -> job failed without retry
Technical failure -> BullMQ retries up to 3 attempts with exponential backoff
```

Job status can be inspected with:

```http
GET /workflow-executions/:id/job
```

Stale worker recovery can be triggered with:

```http
POST /workflow-executions/recovery/stale-running
```

or manually inside the API environment:

```bash
npm run workflow:recover-stale
```

## Workflow Statuses

### Workflow Execution Statuses

| Status | Description |
| --- | --- |
| PENDING | Execution was created but has not started processing |
| RUNNING | Execution is currently being processed |
| COMPLETED | Execution completed successfully |
| FAILED | Execution failed during processing |
| CANCELED | Execution was canceled |

### Workflow Execution Step Statuses

| Status | Description |
| --- | --- |
| PENDING | Step was created but has not started |
| RUNNING | Step is currently being processed |
| COMPLETED | Step completed successfully |
| FAILED | Step failed during processing |
| SKIPPED | Step was skipped |

## Roles

GovFlow currently supports three roles:

| Role | Description |
| --- | --- |
| ADMIN | Full administrative access |
| MANAGER | Management-level access to selected administrative resources |
| OPERATOR | Operational user with restricted access |

## Authorization

Protected routes use role-based access control.

| Route | Access |
| --- | --- |
| `GET /health` | Public |
| `POST /auth/login` | Public |
| `GET /auth/me` | Authenticated users |
| `GET /auth/admin-check` | ADMIN |
| `GET /users` | ADMIN |
| `GET /users/:id` | ADMIN |
| `POST /users` | ADMIN |
| `GET /departments` | ADMIN, MANAGER |
| `GET /departments/:id` | ADMIN, MANAGER |
| `POST /departments` | ADMIN |
| `GET /audit-logs` | ADMIN, MANAGER |
| `POST /audit-logs` | ADMIN |
| `GET /workflows` | ADMIN, MANAGER |
| `GET /workflows/:id` | ADMIN, MANAGER |
| `POST /workflows` | ADMIN, MANAGER |
| `GET /workflows/:workflowId/steps` | ADMIN, MANAGER |
| `POST /workflows/:workflowId/steps` | ADMIN, MANAGER |
| `POST /workflows/:workflowId/executions` | ADMIN, MANAGER, OPERATOR |
| `GET /workflow-executions` | ADMIN, MANAGER |
| `GET /workflow-executions/:id` | ADMIN, MANAGER |
| `GET /workflow-executions/:id/job` | ADMIN, MANAGER |
| `GET /workflow-executions/:executionId/steps` | ADMIN, MANAGER |
| `POST /workflow-executions/:id/process` | ADMIN, MANAGER |
| `GET /health/deep` | ADMIN |
| `GET /jira/test-connection` | ADMIN |

## Authentication

The API uses JWT-based authentication.

Login:

```http
POST /auth/login
```

Example body:

```json
{
  "email": "manager@govflow.local",
  "password": "Manager123"
}
```

Use the returned token in protected routes:

```http
Authorization: Bearer <accessToken>
```

## API Documentation

See [`docs/api.md`](docs/api.md) for endpoint bodies, filters, responses, and
validation rules.

## API Response Pattern

Success response:

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {}
}
```

Paginated response:

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error response:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": []
}
```

## Audit Events

The application records system and business events in `audit_logs`.

Current automatic events include:

```txt
HEALTH_CHECK_DEEP_EXECUTED
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
WORKFLOW_EXECUTION_PROCESS_TECHNICAL_FAILURE
WORKFLOW_EXECUTION_PROCESS_SKIPPED
WORKFLOW_EXECUTION_STEP_SKIPPED
WORKFLOW_EXECUTION_RECOVERY_FAILED
JIRA_COMMENT_ATTEMPTED
JIRA_COMMENT_COMPLETED
JIRA_COMMENT_FAILED
JIRA_TRANSITION_ATTEMPTED
JIRA_TRANSITION_COMPLETED
JIRA_TRANSITION_FAILED
```

`HEALTH_CHECK_DEEP_EXECUTED` is recorded by the admin-only deep health check; the
public `/health` endpoint does not write an audit log per request.

`WORKFLOW_EXECUTION_PROCESS_SKIPPED` is recorded when the worker finishes an
execution that was already finalized concurrently (for example, recovered as
`FAILED`), so it reports the existing terminal state instead of overwriting it.

`WORKFLOW_EXECUTION_STEP_SKIPPED` is recorded when a step is skipped idempotently
(already completed, comment already created, transition already applied) or
cannot be safely re-claimed; the `reason` in the metadata carries the detail.

## Testing

Run the automated test suite locally:

```bash
npm test
```

Run tests inside the API container:

```bash
docker exec govflow_api npm test
```

Automated coverage includes migration contracts, validators, repository helpers,
route registration and ordering, execution step listing, asynchronous workflow
processing, real Jira comment/transition handlers, failure handling,
retry/queue payload behavior, job status observability, stale RUNNING execution
recovery, the guarded finalization that protects against recovery/worker lost
updates, atomic step claiming, per-step output persistence, JIRA_COMMENT and
JIRA_TRANSITION deduplication, and an end-to-end multi-attempt retry scenario.

## Useful Commands

```bash
docker compose up --build
docker compose down
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f postgres
docker compose logs -f redis
docker exec -it govflow_postgres psql -U govflow_user -d govflow_db
docker exec -it govflow_api npm run db:migrate
docker exec -it govflow_api npm run db:seed
docker exec -it govflow_api npm run workflow:recover-stale
docker exec govflow_api npm test
```

## Next Steps

Sprint 6.4.2 delivered step-level idempotency and local deduplication of Jira
side effects on top of the real Jira integration and security hardening of the
prior sprints.

Planned next improvements:

- Remote-Assisted Jira Deduplication: persistence closer to the Jira call and
  optional remote dedup/verification (lookup comments by idempotencyKey; check
  current issue status/transitions to tell "already applied" from a real failure)
- Observability of skips by audit reason and worker/queue metrics
- Queue dashboard / admin tooling
- Automatic scheduled recovery for stale RUNNING executions
- External API timeout tuning and circuit-breaking
- Optional removal of the temporary `/enqueue` alias
