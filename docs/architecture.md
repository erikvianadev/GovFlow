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

### schema_migrations

Stores executed migration filenames. This prevents running the same migration
multiple times.

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
Workflow domain modeling
Redis
BullMQ
Background jobs
Domain events
Frontend dashboard
Deployment pipeline
```
