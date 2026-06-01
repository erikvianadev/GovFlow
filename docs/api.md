# GovFlow API Documentation

## Base URL

Local development:

```txt
http://localhost:3000
```

## Authentication Header

Protected routes require a JWT access token:

```http
Authorization: Bearer <accessToken>
```

## Response Pattern

### Success

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {}
}
```

### Paginated Success

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email must be valid"
    }
  ]
}
```

## Health

### GET /health

Checks API and database status. This public endpoint records a
`HEALTH_CHECK_EXECUTED` audit log with the database status in its metadata.

#### Access

Public.

#### Response

```json
{
  "success": true,
  "message": "Health status retrieved successfully",
  "data": {
    "status": "ok",
    "service": "GovFlow API",
    "timestamp": "2026-06-01T00:00:00.000Z",
    "dependencies": {
      "database": {
        "status": "ok"
      }
    }
  }
}
```

## Authentication

### POST /auth/login

Authenticates a user and returns an access token.

#### Access

Public.

#### Body

```json
{
  "email": "manager@govflow.local",
  "password": "Manager123"
}
```

#### Response

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

#### Errors

Invalid credentials return `401 Unauthorized`:

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

Inactive users return `403 Forbidden`:

```json
{
  "success": false,
  "message": "User is inactive"
}
```

### GET /auth/me

Returns the authenticated user.

#### Access

Authenticated users.

#### Headers

```http
Authorization: Bearer <accessToken>
```

#### Response

```json
{
  "success": true,
  "message": "Authenticated user retrieved successfully",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Manager User",
      "email": "manager@govflow.local",
      "role": "MANAGER",
      "department_id": "uuid",
      "is_active": true
    }
  }
}
```

### GET /auth/admin-check

Test route for ADMIN-only access.

#### Access

ADMIN only.

#### Headers

```http
Authorization: Bearer <accessToken>
```

## Departments

### GET /departments

Lists departments.

#### Access

ADMIN, MANAGER.

#### Query Params

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| isActive | boolean | no | Filter active or inactive departments |

### GET /departments/:id

Returns a department by ID.

#### Access

ADMIN, MANAGER.

### POST /departments

Creates a department.

#### Access

ADMIN only.

#### Body

```json
{
  "name": "Financeiro",
  "description": "Departamento responsavel por processos financeiros."
}
```

#### Validation Rules

| Field | Required | Rule |
| --- | ---: | --- |
| name | yes | string, not empty, max 100 characters |
| description | no | string, max 500 characters |

## Users

### GET /users

Lists users.

#### Access

ADMIN only.

#### Query Params

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| role | string | no | `ADMIN`, `MANAGER`, or `OPERATOR` |
| departmentId | UUID | no | Filter by department |
| isActive | boolean | no | Filter active or inactive users |

### GET /users/:id

Returns a user by ID.

#### Access

ADMIN only.

### POST /users

Creates a user. The API hashes `password` with bcrypt and never returns
`password` or `password_hash`.

#### Access

ADMIN only.

#### Body

```json
{
  "name": "Operator User",
  "email": "operator@govflow.local",
  "password": "Operator123",
  "role": "OPERATOR",
  "departmentId": "uuid"
}
```

#### Validation Rules

| Field | Required | Rule |
| --- | ---: | --- |
| name | yes | string, not empty, max 150 characters |
| email | yes | valid email, max 255 characters |
| password | yes | min 8 chars, max 72 chars, at least one letter and one number |
| role | yes | `ADMIN`, `MANAGER`, or `OPERATOR` |
| departmentId | no | valid UUID |

## Audit Logs

### GET /audit-logs

Lists audit logs ordered by `created_at DESC`.

#### Access

ADMIN, MANAGER.

#### Query Params

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| action | string | no | Exact match filter by action |
| entity | string | no | Exact match filter by entity |
| startDate | date | no | Include logs created at or after this date |
| endDate | date | no | Include logs created at or before this date |

`startDate` and `endDate` accept values parsed by JavaScript as dates. Use full
ISO timestamps when the intended time boundary matters.

### POST /audit-logs

Creates an audit log manually. This endpoint is currently useful for testing
and internal system events.

#### Access

ADMIN only.

#### Body

```json
{
  "action": "MANUAL_AUDIT_TEST",
  "entity": "audit_log",
  "entityId": "manual-test",
  "actorId": null,
  "metadata": {
    "source": "postman"
  }
}
```

#### Validation Rules

| Field | Required | Rule |
| --- | ---: | --- |
| action | yes | string, not empty, max 100 characters |
| entity | yes | string, not empty, max 100 characters |
| entityId | no | string, max 100 characters |
| actorId | no | string; must be a valid UUID for insert |
| metadata | no | object, not array |
