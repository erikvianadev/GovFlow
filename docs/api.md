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

Access: public.

## Authentication

### POST /auth/login

Authenticates a user and returns an access token.

Access: public.

Body:

```json
{
  "email": "manager@govflow.local",
  "password": "Manager123"
}
```

Response:

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

Audit events:

- `LOGIN_SUCCESS`
- `LOGIN_FAILED`

### GET /auth/me

Returns the authenticated user.

Access: authenticated users.

### GET /auth/admin-check

Test route for ADMIN-only access.

Access: ADMIN.

## Departments

### GET /departments

Lists departments.

Access: ADMIN, MANAGER.

Query params:

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| isActive | boolean | no | Filter active or inactive departments |

### GET /departments/:id

Returns a department by ID.

Access: ADMIN, MANAGER.

### POST /departments

Creates a department.

Access: ADMIN.

Body:

```json
{
  "name": "Financeiro",
  "description": "Departamento responsavel por processos financeiros."
}
```

Audit event: `DEPARTMENT_CREATED`.

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| name | yes | string, not empty, max 100 characters |
| description | no | string, max 500 characters |

## Users

### GET /users

Lists users.

Access: ADMIN.

Query params:

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| role | string | no | `ADMIN`, `MANAGER`, or `OPERATOR` |
| departmentId | UUID | no | Filter by department |
| isActive | boolean | no | Filter active or inactive users |

### GET /users/:id

Returns a user by ID.

Access: ADMIN.

### POST /users

Creates a user. The API hashes `password` with bcrypt and never returns
`password` or `password_hash`.

Access: ADMIN.

Body:

```json
{
  "name": "Operator User",
  "email": "operator@govflow.local",
  "password": "Operator123",
  "role": "OPERATOR",
  "departmentId": "uuid"
}
```

Audit event: `USER_CREATED`.

Validation rules:

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

Access: ADMIN, MANAGER.

Query params:

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| action | string | no | Exact match filter by action |
| entity | string | no | Exact match filter by entity |
| startDate | date | no | Include logs created at or after this date |
| endDate | date | no | Include logs created at or before this date |

Use full ISO timestamps for date filters when the intended time boundary
matters.

### POST /audit-logs

Creates an audit log manually. This endpoint is useful for internal system
events and testing.

Access: ADMIN.

Body:

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

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| action | yes | string, not empty, max 100 characters |
| entity | yes | string, not empty, max 100 characters |
| entityId | no | string, max 100 characters |
| actorId | no | string; must be a valid UUID for insert |
| metadata | no | object, not array |

## Workflows

### GET /workflows

Lists workflows ordered by `created_at DESC`.

Access: ADMIN, MANAGER.

Query params:

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| departmentId | UUID | no | Filter by department |
| createdBy | UUID | no | Filter by creator |
| isActive | boolean | no | Filter active or inactive workflows |

### GET /workflows/:id

Returns a workflow by ID.

Access: ADMIN, MANAGER.

### POST /workflows

Creates a workflow.

Access: ADMIN, MANAGER.

Body:

```json
{
  "name": "Fluxo de Aprovacao Tecnica",
  "description": "Workflow para validar solicitacoes tecnicas.",
  "departmentId": "uuid"
}
```

Backend-defined fields:

```txt
created_by -> req.user.id
is_active  -> true
```

Audit event: `WORKFLOW_CREATED`.

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| name | yes | string, not empty, max 150 characters |
| description | no | string, max 1000 characters |
| departmentId | no | valid UUID |

## Workflow Steps

### GET /workflows/:workflowId/steps

Lists workflow steps ordered by `step_order ASC`.

Access: ADMIN, MANAGER.

Rules:

- `workflowId` is required and must be a valid UUID.
- The workflow must exist.

### POST /workflows/:workflowId/steps

Creates an ordered step for a workflow.

Access: ADMIN, MANAGER.

Body:

```json
{
  "name": "Validacao manual",
  "description": "Etapa de validacao pela equipe tecnica.",
  "stepOrder": 1,
  "actionType": "MANUAL",
  "configuration": {
    "instructions": "Revisar dados da solicitacao."
  }
}
```

Audit event: `WORKFLOW_STEP_CREATED`.

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| workflowId | yes | valid UUID from route |
| name | yes | string, not empty, max 150 characters |
| description | no | string, max 1000 characters |
| stepOrder | yes | integer greater than 0; unique per workflow |
| actionType | yes | `MANUAL`, `JIRA_TRANSITION`, `JIRA_COMMENT`, or `NOTIFICATION` |
| configuration | no | object, not array |

## Workflow Executions

### POST /workflows/:workflowId/executions

Creates a workflow execution with status `PENDING`.

Access: ADMIN, MANAGER, OPERATOR.

Body:

```json
{
  "input": {
    "requestId": "REQ-001",
    "priority": "high",
    "source": "manual"
  }
}
```

Backend-defined fields:

```txt
workflow_id  -> route param workflowId
started_by   -> req.user.id
status       -> PENDING
result       -> null
started_at   -> null
completed_at -> null
```

Audit event: `WORKFLOW_EXECUTION_CREATED`.

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| workflowId | yes | valid UUID from route; workflow must exist and be active |
| input | no | object, not array |

Important behavior:

- This endpoint automatically creates `workflow_execution_steps` from active
  workflow steps.
- If the workflow has no active steps, the API returns `409`.
- It does not process the execution immediately.
- It does not call Jira.
- It does not send notifications.

Response includes:

```json
{
  "execution_steps_count": 2
}
```

Workflow without active steps:

```json
{
  "success": false,
  "message": "Workflow must have at least one active step to be executed"
}
```

### GET /workflow-executions

Lists workflow executions ordered by `created_at DESC`.

Access: ADMIN, MANAGER.

Query params:

| Param | Type | Required | Description |
| --- | --- | ---: | --- |
| page | number | no | Current page. Defaults to 1 |
| limit | number | no | Items per page. Defaults to 20. Max 100 |
| workflowId | UUID | no | Filter by workflow |
| startedBy | UUID | no | Filter by user that started the execution |
| status | string | no | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, or `CANCELED` |

Example:

```http
GET /workflow-executions?status=PENDING
Authorization: Bearer <accessToken>
```

### GET /workflow-executions/:id

Returns a workflow execution by ID.

Access: ADMIN, MANAGER.

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| id | yes | valid UUID |

## Workflow Execution Steps

### GET /workflow-executions/:executionId/steps

Lists the steps generated for a workflow execution ordered by
`step_order ASC`.

Access: ADMIN, MANAGER.

Headers:

```http
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "success": true,
  "message": "Workflow execution steps retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "execution_id": "uuid",
      "step_id": "uuid",
      "step_name": "Validar solicitacao",
      "step_description": "Etapa manual de validacao inicial.",
      "step_order": 1,
      "action_type": "MANUAL",
      "configuration": {
        "instructions": "Review request details"
      },
      "status": "PENDING",
      "started_at": null,
      "completed_at": null,
      "error_message": null,
      "created_at": "2026-06-01T00:00:00.000Z",
      "updated_at": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

Validation rules:

| Field | Required | Rule |
| --- | ---: | --- |
| executionId | yes | valid UUID; execution must exist |

## Workflow Processing

### POST /workflow-executions/:id/process

Processes a pending workflow execution synchronously.

Access: ADMIN, MANAGER.

Headers:

```http
Authorization: Bearer <accessToken>
```

Behavior:

- validates the execution ID
- requires the execution to be `PENDING`
- loads execution steps
- marks the execution as `RUNNING`
- processes steps in `step_order ASC`
- marks each step as `RUNNING`
- marks successful steps as `COMPLETED`
- marks the execution as `COMPLETED` if all steps succeed
- marks the failing step as `FAILED` if a step fails
- marks the execution as `FAILED` if any step fails

Success response:

```json
{
  "success": true,
  "message": "Workflow execution processed successfully",
  "data": {
    "id": "uuid",
    "workflow_id": "uuid",
    "started_by": "uuid",
    "status": "COMPLETED",
    "result": {
      "processedBy": "uuid",
      "stepsProcessed": 2,
      "steps": [
        {
          "executionStepId": "uuid",
          "stepId": "uuid",
          "stepOrder": 1,
          "actionType": "MANUAL",
          "output": {
            "simulated": true,
            "actionType": "MANUAL",
            "message": "Manual step completed by synchronous processor simulation"
          }
        }
      ]
    }
  }
}
```

Controlled failure response:

A workflow processing failure is returned as HTTP `200` with business status
`FAILED`.

```json
{
  "success": true,
  "message": "Workflow execution processed successfully",
  "data": {
    "id": "uuid",
    "status": "FAILED",
    "result": {
      "processedBy": "uuid",
      "stepsProcessed": 1,
      "failedStep": {
        "executionStepId": "uuid",
        "stepId": "uuid",
        "stepOrder": 2,
        "actionType": "MANUAL",
        "error": "Simulated processor failure"
      },
      "steps": []
    }
  }
}
```

Errors:

Invalid ID:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "id",
      "message": "Workflow execution ID must be a valid UUID"
    }
  ]
}
```

Execution not found:

```json
{
  "success": false,
  "message": "Workflow execution not found"
}
```

Execution not `PENDING`:

```json
{
  "success": false,
  "message": "Only PENDING workflow executions can be processed"
}
```

Audit events:

- `WORKFLOW_EXECUTION_PROCESS_STARTED`
- `WORKFLOW_EXECUTION_PROCESS_COMPLETED`
- `WORKFLOW_EXECUTION_PROCESS_FAILED`

## RBAC Summary

| Resource | ADMIN | MANAGER | OPERATOR |
| --- | ---: | ---: | ---: |
| Users | yes | no | no |
| Departments read | yes | yes | no |
| Departments create | yes | no | no |
| Audit logs read | yes | yes | no |
| Audit logs create | yes | no | no |
| Workflows read | yes | yes | no |
| Workflows create | yes | yes | no |
| Workflow steps read | yes | yes | no |
| Workflow steps create | yes | yes | no |
| Workflow executions create | yes | yes | yes |
| Workflow executions read | yes | yes | no |
| Workflow execution steps read | yes | yes | no |
| Workflow processing | yes | yes | no |
