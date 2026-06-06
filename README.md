# GovFlow Backend

GovFlow is a backend API for administrative workflow automation. It is being
built incrementally with a focus on maintainable domain modeling, PostgreSQL
foundations, auditability, authentication, authorization, and future automation
integrations such as Jira.

## Current Status

Sprint 3 - Workflow Domain Foundation completed.

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
- Workflows module
- Workflow steps module
- Workflow executions module
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
```

## Domain Model

Sprint 3 introduced the workflow domain foundation:

```txt
Workflow
+-- WorkflowStep
+-- WorkflowExecution
```

- `workflows` define the process.
- `workflow_steps` define ordered actions inside a workflow.
- `workflow_executions` record each time a workflow is started.

Workflow executions currently create a `PENDING` record only. GovFlow does not
process workflow steps, call Jira, send notifications, or run background jobs
yet. That behavior is intentionally deferred to a future processing layer.

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

Sprint 3 currently has automated coverage for migration contracts, validators,
repository filter builders, and route registration.

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

Recommended next work:

- Document and open the Sprint 3 PR.
- Add a processing model for workflow executions.
- Introduce workflow execution step logs.
- Evaluate a queue or worker layer for asynchronous automation.
- Add Jira integration behavior after the workflow execution contract is stable.
