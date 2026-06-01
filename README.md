# GovFlow Backend

GovFlow is a backend API for administrative workflow automation, designed to
support corporate processes and future integrations such as Jira.

The project is being built incrementally with a focus on maintainability,
database modeling, observability, and practical backend engineering.

## Current Status

Sprint 2 - Domain Modeling and Authentication Foundation completed.

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
- Departments module
- Users module
- Pagination and filters
- Input validation
- Request logging middleware
- SQL migrations and seeds
- Password hashing with bcrypt
- Login endpoint
- JWT access token generation
- Authentication middleware
- Role-based authorization middleware
- Protected routes

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

## Roles

GovFlow currently supports three roles:

| Role | Description |
| --- | --- |
| ADMIN | Full administrative access |
| MANAGER | Management-level access to selected administrative resources |
| OPERATOR | Basic operational user with restricted access |

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

Example response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Manager User",
      "email": "manager@govflow.local",
      "role": "MANAGER",
      "department_id": "uuid",
      "is_active": true,
      "created_at": "2026-06-01T00:00:00.000Z",
      "updated_at": "2026-06-01T00:00:00.000Z"
    },
    "accessToken": "jwt-token"
  }
}
```

Use the token in protected routes:

```http
Authorization: Bearer <accessToken>
```

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

## API Health Check

```http
GET /health
```

Each health check also records a `HEALTH_CHECK_EXECUTED` audit log.

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

## Architecture Style

The project currently follows a layered architecture:

```txt
Route -> Controller -> Service -> Repository -> Database
```

- Routes define HTTP endpoints and access policies.
- Controllers handle request and response data.
- Services contain application rules.
- Repositories access the database.
- Validators protect input data.
- Middlewares handle cross-cutting concerns, authentication, and authorization.

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

Sprint 3 will focus on Jira integration foundations and workflow domain
modeling.

Planned next modules:

- Jira integration configuration
- Jira project mapping
- Workflow domain modeling
- Initial automation execution model
- Improved audit trail for authentication and administrative actions
