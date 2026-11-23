# GovFlow

**An asynchronous workflow automation backend built with Node.js, PostgreSQL, Redis, and BullMQ.**

GovFlow is a backend portfolio project for defining, executing, and monitoring administrative workflows. It combines an Express REST API, a dedicated background worker, and an optional Jira Cloud integration to explore reliable processing across databases, queues, and external services.

## The Problem

A workflow can span several steps, depend on an external API, and outlive a single HTTP request. Retrying a failed job can repeat side effects; a worker crash can leave executions stuck in an intermediate state; and different users should not have unrestricted access to every workflow.

GovFlow addresses these concerns through asynchronous execution, persistent step-level state, access controls, auditing, and explicit recovery mechanisms.

## What It Does

| Area | Implemented capabilities |
| --- | --- |
| Workflow management | Department-scoped workflows, ordered steps, activation/deactivation, and template duplication |
| Execution | Asynchronous processing through BullMQ, Redis, and a separate worker |
| Jira Cloud | Real issue comments and transitions; simulated manual and notification actions |
| Security | JWT authentication, role-based permissions, department-level authorization, password hashing, and request rate limiting |
| Operations | Audit logs, structured logging, job-status tracking, an admin-only queue dashboard, and manual stale-execution recovery |

## Architecture at a Glance

```text
Client
  |
  v
Express REST API -----> PostgreSQL
  |                     (users, workflows, executions,
  |                      step state, audit logs)
  v
BullMQ / Redis
  |
  v
Background Worker
  |
  v
Workflow Processor --> Step Handler --> Jira Integration Service --> Jira Cloud
```

The application separates routes, controllers, services, repositories, and action handlers. The worker consumes jobs; it does not call Jira directly. See [architecture documentation](docs/architecture.md) for the domain model and request-processing details.

## Engineering Highlights

- **Concurrency and consistency:** PostgreSQL transactions, atomic step claims (`PENDING -> RUNNING`), and guarded terminal updates reduce duplicate processing and lost updates.
- **Retries and failure handling:** technical failures use BullMQ retries with exponential backoff; business failures are treated as non-retryable.
- **Idempotency safeguards:** persisted step output prevents known Jira operations from running again. Stale-execution recovery also performs a best-effort read-only Jira lookup for previously created comments. These measures do **not** guarantee exactly-once effects across Jira and PostgreSQL.
- **Security:** JWT, role-based and department-scoped authorization, rate limiting, CORS restrictions, security headers, and secret redaction in logs.
- **Observability:** correlated request/execution logs, audit events, job inspection, and restricted administrative queue controls.

## Current Project Status

- **Default branch (`main`):** JavaScript backend with Sprint 6.8 (workflow templates and reusability) completed.
- **Sprint 7:** TypeScript migration is in progress on the separate [`sprint-7/typescript-migration` branch](../../tree/sprint-7/typescript-migration); it is not presented here as completed.
- **Jira integration:** available for `JIRA_COMMENT` and `JIRA_TRANSITION` when configured. It is disabled by default.
- **Scope:** an evolving portfolio project, not a claim of production deployment.

## Quick Start (Local Development)

1. Copy `.env.example` to `.env` and set the required database configuration and a private `JWT_SECRET`. Leave `JIRA_ENABLED=false` unless you have Jira Cloud credentials.
2. Start the development containers and initialize the database:

```bash
docker compose up --build -d
docker exec -it govflow_api npm run db:migrate
docker exec -it govflow_api npm run db:seed
```

3. Check the API at `GET http://localhost:3000/health`. Refer to [API documentation](docs/api.md) for authentication, request bodies, and protected endpoints.
4. Run the test suite with `docker exec govflow_api npm test`.

**Note:** `docker-compose.yml` is for local development, not production deployment. See [Docker development notes](docs/docker-dev.md) and [production-oriented configuration](docs/docker-prod.md).

## Documentation

- [Architecture and workflow processing](docs/architecture.md)
- [API contracts and examples](docs/api.md)
- [Jira idempotency decisions and residual risks](docs/jira-idempotency.md)
- [Jira error handling](docs/jira-errors.md)
- [Local Docker workflow](docs/docker-dev.md)
- [Production-oriented Docker setup](docs/docker-prod.md)

The sections below retain the detailed technical reference, configuration, access rules, and operational commands.

---

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
  admin/
  audit-logs/
  auth/
  health/
  infra/
  jira/
  users/
  workflow-execution-steps/
  workflow-executions/
  workflow-processing/
  workflow-steps/
  workflows/
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

# Logging level (pino): fatal, error, warn, info, debug, trace, silent.
# Defaults: info in production, silent under test, debug in development.
LOG_LEVEL=debug

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
step lifecycle, audit reasons, and known residual risks. See
[`docs/jira-errors.md`](docs/jira-errors.md) for what each Jira error status
means for an operator and when GovFlow retries automatically versus needing
manual action.

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
| `PATCH /workflows/:id` | ADMIN, MANAGER |
| `POST /workflows/:id/duplicate` | ADMIN, MANAGER |
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
| `GET /admin/queue/stats` | ADMIN |
| `GET /admin/queue/jobs` | ADMIN |
| `POST /admin/queue/jobs/:jobId/retry` | ADMIN |
| `DELETE /admin/queue/jobs/:jobId` | ADMIN |

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
WORKFLOW_UPDATED
WORKFLOW_DUPLICATED
WORKFLOW_STEP_CREATED
WORKFLOW_EXECUTION_CREATED
WORKFLOW_EXECUTION_PROCESS_STARTED
WORKFLOW_EXECUTION_PROCESS_COMPLETED
WORKFLOW_EXECUTION_PROCESS_FAILED
WORKFLOW_EXECUTION_PROCESS_TECHNICAL_FAILURE
WORKFLOW_EXECUTION_PROCESS_SKIPPED
WORKFLOW_EXECUTION_STEP_SKIPPED
WORKFLOW_EXECUTION_RECOVERY_FAILED
WORKFLOW_EXECUTION_STEP_RECOVERED_VIA_JIRA_LOOKUP
JIRA_COMMENT_ATTEMPTED
JIRA_COMMENT_COMPLETED
JIRA_COMMENT_FAILED
JIRA_TRANSITION_ATTEMPTED
JIRA_TRANSITION_COMPLETED
JIRA_TRANSITION_FAILED
```

`HEALTH_CHECK_DEEP_EXECUTED` is recorded by the admin-only deep health check; the
public `/health` endpoint does not write an audit log per request.

`WORKFLOW_UPDATED` is recorded when a workflow's `is_active` flag is changed
via PATCH. `WORKFLOW_DUPLICATED` is recorded when a workflow is duplicated,
with metadata linking the source and new workflow ids.

`WORKFLOW_EXECUTION_PROCESS_SKIPPED` is recorded when the worker finishes an
execution that was already finalized concurrently (for example, recovered as
`FAILED`), so it reports the existing terminal state instead of overwriting it.

`WORKFLOW_EXECUTION_STEP_SKIPPED` is recorded when a step is skipped idempotently
(already completed, comment already created, transition already applied) or
cannot be safely re-claimed; the `reason` in the metadata carries the detail.

`WORKFLOW_EXECUTION_STEP_RECOVERED_VIA_JIRA_LOOKUP` is recorded when the
stale-running recovery confirms, via a read-only Jira lookup, that a `RUNNING`
`JIRA_COMMENT` step's comment already exists, and corrects the step to
`COMPLETED` instead of `FAILED`. The execution itself is still finalized
`FAILED`; only the step-level truth is corrected so a future retry never
duplicates the comment.

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

Planned next improvements:

- Sprint 7 (in progress on a separate branch): migrate the GovFlow codebase from JavaScript to TypeScript
- Preserve current behavior and test suite reliability throughout the migration
- Introduce stronger typing across services, repositories, handlers and workflow processing
- Remote dedup at processing time and JIRA_TRANSITION verification
- Observability of skips by audit reason and worker/queue metrics
- Automatic scheduled recovery for stale RUNNING executions
- External API timeout tuning and circuit-breaking
