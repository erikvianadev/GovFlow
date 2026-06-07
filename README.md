# GovFlow Backend

GovFlow is a backend API for administrative workflow automation. It is being
built incrementally with a focus on maintainable domain modeling, PostgreSQL
foundations, auditability, authentication, authorization, and future automation
integrations such as Jira.

## Current Status

Sprint 4 - Workflow Processing Foundation completed.

The current backend includes:

- Express API structure
- PostgreSQL database
- Dockerized API and database
- Environment variables
- Database connection pool
- Health check endpoint
- Global error handling
- Standardized API responses
- Request logging middleware
- SQL migrations and seeds
- Audit logs module
- Departments module
- Users module
- Password hashing with bcrypt
- Login endpoint
- JWT access token generation
- Authentication middleware
- Role-based authorization middleware
- Protected routes
- Workflows module
- Workflow steps module
- Workflow executions module
- Workflow execution steps module
- Transaction support for multi-step database operations
- Synchronous workflow processor
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
- Docker
- Docker Compose
- JavaScript
- bcrypt
- JSON Web Token

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

JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1h
```

`JWT_SECRET` must be a long, private value in production. When running with
Docker Compose, the API container uses `DB_HOST=postgres`.

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
govflow_postgres
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
```

## Domain Model

Sprint 4 completed the workflow processing foundation:

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
workflow steps. The synchronous processor can move an execution through its
steps and finish it as `COMPLETED` or `FAILED`.

## Workflow Processing

GovFlow now includes an initial synchronous workflow processor.

Current processing flow:

```txt
Workflow execution created
  -> Execution steps created automatically from active workflow steps
  -> Execution starts as PENDING
  -> Processor marks execution as RUNNING
  -> Processor processes execution steps in step_order ASC
  -> Each step moves from PENDING to RUNNING
  -> Each successful step moves to COMPLETED
  -> Execution moves to COMPLETED when all steps succeed
```

Failure flow:

```txt
Execution RUNNING
  -> Step RUNNING
  -> Step FAILED
  -> Execution FAILED
```

The processor is currently synchronous and simulated. It does not call Jira,
email services, webhooks, Redis, BullMQ, or external systems yet.

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
| `GET /workflow-executions/:executionId/steps` | ADMIN, MANAGER |
| `POST /workflow-executions/:id/process` | ADMIN, MANAGER |

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
```

## Testing

Run the automated test suite locally:

```bash
npm test
```

Run tests inside the API container:

```bash
docker exec govflow_api npm test
```

Sprint 4 currently has automated coverage for migration contracts, validators,
repository helpers, route registration, execution step listing, workflow
processing, simulated handlers, and failure handling.

## Useful Commands

```bash
docker compose up --build
docker compose down
docker compose logs -f api
docker compose logs -f postgres
docker exec -it govflow_postgres psql -U govflow_user -d govflow_db
docker exec -it govflow_api npm run db:migrate
docker exec -it govflow_api npm run db:seed
docker exec govflow_api npm test
```

## Next Steps

Sprint 5 will focus on asynchronous processing foundations.

Planned next improvements:

- Redis
- BullMQ
- Background workers
- Retry strategy
- Job status tracking
- Safer recovery for RUNNING executions
- Preparation for Jira integration
