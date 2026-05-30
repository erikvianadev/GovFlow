# GovFlow API Documentation

## Base URL

Local development:

```txt
http://localhost:3000
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
      "field": "action",
      "message": "Action is required"
    }
  ]
}
```

## Health

### GET /health

Checks API and database status. Each request also records a
`HEALTH_CHECK_EXECUTED` audit log with the database status in its metadata.

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

### GET /audit-logs

Lists audit logs ordered by `created_at DESC`.

#### Query Params

| Param     | Type   | Required | Description                                |
| --------- | ------ | -------: | ------------------------------------------ |
| page      | number |       no | Current page. Defaults to 1                |
| limit     | number |       no | Items per page. Defaults to 20. Max 100    |
| action    | string |       no | Exact match filter by action               |
| entity    | string |       no | Exact match filter by entity               |
| startDate | date   |       no | Include logs created at or after this date |
| endDate   | date   |       no | Include logs created at or before this date|

`startDate` and `endDate` accept values parsed by JavaScript as dates. Use full
ISO timestamps when the intended time boundary matters.

#### Example

```http
GET /audit-logs?page=1&limit=10&entity=health
```

#### Response

```json
{
  "success": true,
  "message": "Audit logs retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "action": "HEALTH_CHECK_EXECUTED",
      "entity": "health",
      "entity_id": "health-endpoint",
      "actor_id": null,
      "metadata": {
        "source": "example"
      },
      "created_at": "2026-05-30T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### POST /audit-logs

Creates an audit log manually. This endpoint is currently useful for testing
and internal system events.

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

| Field    | Required | Rule                                  |
| -------- | -------: | ------------------------------------- |
| action   |      yes | string, not empty, max 100 characters |
| entity   |      yes | string, not empty, max 100 characters |
| entityId |       no | string, max 100 characters            |
| actorId  |       no | string; must be a valid UUID for insert|
| metadata |       no | object, not array                     |

#### Response

```json
{
  "success": true,
  "message": "Audit log created successfully",
  "data": {
    "id": "uuid",
    "action": "MANUAL_AUDIT_TEST",
    "entity": "audit_log",
    "entity_id": "manual-test",
    "actor_id": null,
    "metadata": {
      "source": "postman"
    },
    "created_at": "2026-05-30T00:00:00.000Z"
  }
}
```
