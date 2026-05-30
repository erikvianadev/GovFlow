# GovFlow Backend

GovFlow is a backend API for administrative workflow automation, designed to
support corporate processes and future integrations such as Jira.

The project is being built incrementally with a focus on maintainability,
database modeling, observability, and practical backend engineering.

## Current Status

Sprint 1 - Backend Foundation completed.

The current backend includes:

- Express API structure
- PostgreSQL database
- Dockerized API and database
- Environment variables
- Database connection pool
- Health check endpoint
- Global error handling
- Standardized API responses
- Audit logs module
- Pagination and filters
- Input validation
- Request logging middleware
- SQL migrations and seeds

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Docker
- Docker Compose
- JavaScript

## Project Structure

```txt
scripts/
  runMigrations.js
  runSeeds.js
src/
  config/
  database/
  errors/
  middlewares/
  modules/
  routes/
  utils/
  validators/
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
```

When running with Docker Compose, the API container uses `DB_HOST=postgres`.

## Running with Docker

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

Migrations are tracked in the `schema_migrations` table. The seed script is
idempotent for the initial records and can be executed again safely.

## API Health Check

```http
GET /health
```

Each health check also records a `HEALTH_CHECK_EXECUTED` audit log.

Example response:

```json
{
  "success": true,
  "message": "Health status retrieved successfully",
  "data": {
    "status": "ok",
    "service": "GovFlow API",
    "timestamp": "2026-05-30T00:00:00.000Z",
    "dependencies": {
      "database": {
        "status": "ok"
      }
    }
  }
}
```

## Audit Logs

List audit logs:

```http
GET /audit-logs
```

With pagination and filters:

```http
GET /audit-logs?page=1&limit=20
GET /audit-logs?action=HEALTH_CHECK_EXECUTED
GET /audit-logs?entity=health
GET /audit-logs?startDate=2026-05-01&endDate=2026-05-30
```

Create an audit log:

```http
POST /audit-logs
```

Example body:

```json
{
  "action": "MANUAL_AUDIT_TEST",
  "entity": "audit_log",
  "entityId": "manual-test",
  "metadata": {
    "source": "postman"
  }
}
```

See [`docs/api.md`](docs/api.md) for the complete endpoint documentation.

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

## Architecture Style

The project currently follows a layered architecture:

```txt
Route -> Controller -> Service -> Repository -> Database
```

- Routes define HTTP endpoints.
- Controllers handle request and response data.
- Services contain application rules.
- Repositories access the database.
- Validators protect input data.
- Middlewares handle cross-cutting concerns.

## Useful Commands

```bash
docker compose up --build
docker compose down
docker compose logs -f api
docker compose logs -f postgres
docker exec -it govflow_postgres psql -U govflow_user -d govflow_db
docker exec -it govflow_api npm run db:migrate
docker exec -it govflow_api npm run db:seed
```

## Next Steps

Sprint 2 will focus on domain modeling and authentication foundations.

Planned modules and capabilities:

- Users
- Organizations or departments
- Authentication base
- Jira project mapping
- Workflow domain modeling
