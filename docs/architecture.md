# GovFlow Backend Architecture

## Current Architecture

The backend currently follows a layered architecture:

```txt
HTTP Request
  -> Route
  -> Controller
  -> Service
  -> Repository
  -> PostgreSQL
```

## Layers

### Routes

Routes define endpoint paths and connect them to controllers.

Current routes:

```txt
GET /health
GET /audit-logs
POST /audit-logs
```

### Controllers

Controllers handle HTTP-specific logic:

- Read params, query strings, and request bodies.
- Call services.
- Return standardized responses.

Controllers should not contain SQL or complex application rules.

### Services

Services contain application rules:

- Validate input.
- Normalize filters.
- Limit pagination.
- Coordinate repositories.
- Register audit logs.

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
- 404 not found responses
- Global error handling

## Current Modules

### Health Module

Checks API and database status and records each health check as an audit log.

```txt
src/modules/health/
  health.controller.js
  health.routes.js
  health.service.js
```

### Audit Logs Module

Lists, filters, and creates audit logs.

```txt
src/modules/audit-logs/
  auditLogs.controller.js
  auditLogs.repository.js
  auditLogs.routes.js
  auditLogs.service.js
```

## Database

The current database is PostgreSQL.

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

Indexes:

```txt
created_at
entity
action
```

### schema_migrations

Stores executed migration filenames. This prevents running the same migration
multiple times.

## Error Handling

The project uses a custom `AppError` class for operational errors such as:

```txt
Validation failed
Route not found
```

Unexpected errors are handled by the global error middleware. In development,
error details are returned. In production, internal details are hidden.

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

## Current Trade-offs

### SQL Instead of ORM

The project currently uses raw SQL with `pg`.

Reasons:

- Better understanding of SQL and database access.
- Less abstraction during the foundation phase.

Prisma may be introduced later.

### Manual Validation

The project currently uses manual validators.

Reasons:

- Understand validation fundamentals.
- Avoid dependencies before they are needed.

A schema validation library such as Zod may be introduced later.

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
Authentication
Authorization
Jira integration
Redis
BullMQ
Background jobs
Domain events
Frontend dashboard
Deployment pipeline
```
