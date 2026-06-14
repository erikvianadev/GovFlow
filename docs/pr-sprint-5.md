# Sprint 5 - Asynchronous Workflow Processing Foundation

## Summary

This PR makes GovFlow process workflow executions asynchronously.

Before Sprint 5, the API processed workflows synchronously inside the request.
Now the API enqueues a BullMQ job, Redis stores the queue state, and a dedicated
worker runs the existing workflow processor in the background:

```txt
Client
  -> POST /workflow-executions/:id/process
  -> API validates + enqueues a BullMQ job
  -> Redis stores the job
  -> Worker consumes the job
  -> Workflow processor executes the steps
  -> PostgreSQL stores execution and step results
  -> Client checks execution/job status
```

The processor remains simulated (no Jira, email, or webhook calls yet) and is
now an internal service called by the worker.

## What Changed

### Redis Infrastructure

- Added Redis as a Docker service and as the backend for BullMQ.
- Added Redis connection management and a health check.
- `GET /health` now validates **PostgreSQL and Redis**. If Redis is
  unavailable, the endpoint reports `degraded` instead of crashing the API.

### BullMQ Queue

- Added the `workflow-processing` queue.
- Jobs use a deterministic ID: `workflow-execution-<executionId>`, which
  prevents duplicate processing requests for the same execution.

### Async Processing Contract

- `POST /workflow-executions/:id/process` no longer processes synchronously. It:
  1. validates the execution ID
  2. checks authentication and authorization (`ADMIN`, `MANAGER`)
  3. validates that the execution is still `PENDING`
  4. enqueues a BullMQ job
  5. returns `202 Accepted` with status `QUEUED`
- `POST /workflow-executions/:id/enqueue` was added as a temporary alias for
  transition/testing and may be removed in a future cleanup.

### Worker

- Added a dedicated `govflow_worker` process consuming the `workflow-processing`
  queue and calling `workflowProcessor.service`.
- The worker is intentionally thin (reads payload, validates `executionId` and
  `processedBy`, calls the processor, reports completed/failed) and runs with
  `concurrency: 1` while the async infrastructure stabilizes.

### Job Status Observability

- Added `GET /workflow-executions/:id/job` to inspect the BullMQ job for an
  execution.
- Returns `jobId`, `queueName`, `state`, `attemptsMade`, `attemptsStarted`,
  `maxAttempts`, `failedReason`, `processedOn`, and `finishedOn`.
- Possible states: `waiting`, `active`, `completed`, `failed`, `delayed`,
  `paused`, `not_found`.
- Job stacktraces are not exposed through the API.

### Retry Strategy

- Workflow processing jobs use:

```txt
attempts: 3
backoff: exponential
delay: 3000ms
removeOnComplete: false
removeOnFail: false
```

- **Business failure** (a step fails by business rule): execution becomes
  `FAILED`, the job fails with `UnrecoverableError`, no unnecessary retries.
- **Technical failure** (unexpected runtime/infra error): thrown as a normal
  error so BullMQ retries up to the configured attempts.

### Stale RUNNING Execution Recovery

- Added recovery for executions stuck in `RUNNING` (e.g. worker crash or power
  loss after the execution was claimed).
- Triggers:

```txt
POST /workflow-executions/recovery/stale-running   (ADMIN)
npm run workflow:recover-stale                       (manual script)
```

- Timeout is configurable via `WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES`
  (default 30).
- Recovery fails the `RUNNING` steps, then fails the execution, preserving
  already `COMPLETED` and later `PENDING` steps, stores `result.recoveryReason`,
  and registers `WORKFLOW_EXECUTION_RECOVERY_FAILED`.
- The recovery endpoint validates `timeoutMinutes`/`limit`: invalid values
  return `400 Validation failed` instead of being silently coerced.

### Recovery Concurrency Protection

- Both the recovery and the worker finalize executions with a guarded
  transition:

```sql
WHERE id = $1
  AND status = 'RUNNING'
```

- This prevents a live-but-slow worker from overwriting a state already written
  by recovery (and vice versa). Whichever actor finalizes first wins; the other
  observes the existing terminal state.
- Recovery runs each execution in a single transaction (fail steps, then fail
  the execution with one guarded write); if the guarded write matches no rows,
  the transaction rolls back so step failures are never committed under an
  execution this run did not finalize.
- The worker records `WORKFLOW_EXECUTION_PROCESS_SKIPPED` when it reaches
  finalization but the execution already left `RUNNING`.

### Security & Reliability Hardening

- Required environment variables validated at boot (`requireEnv`).
- Safer `NODE_ENV` resolution (defaults to `production`).
- Helmet security headers.
- CORS allowlist via `CORS_ORIGINS`.
- Login rate limiting (`express-rate-limit`).
- Explicit JSON body size limit.
- Atomic `PENDING -> RUNNING` claim (`claimPendingExecution`) so concurrent
  worker/API requests cannot process the same execution twice.
- Consistent queue payload using `processedBy`.
- Audit log integrity improvements.

### Docker Development Hardening

- `nodemon -L` for Windows/Docker bind-mount polling.
- `env_file: .env` for the API and worker services.
- `worker` service runs the same image with the worker command.
- Documented rebuilds after `package.json` changes and restarts after `.env`
  changes (for both API and worker).

## New Endpoints

```txt
POST /workflow-executions/:id/process              (now async, 202 QUEUED)
POST /workflow-executions/:id/enqueue              (temporary alias)
GET  /workflow-executions/:id/job
POST /workflow-executions/recovery/stale-running   (ADMIN)
```

## New Audit Events

```txt
WORKFLOW_EXECUTION_PROCESS_SKIPPED
WORKFLOW_EXECUTION_RECOVERY_FAILED
```

## New Configuration

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CORS_ORIGINS=http://localhost:3000
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES=30
```

## New Scripts

```txt
npm run worker:workflow-processing
npm run workflow:recover-stale
```

## Testing

Automated tests cover:

- migration contracts
- validators (including recovery input validation)
- repository helpers and the guarded `finalizeRunningExecution`
- transaction helper behavior
- route registration and ordering (including the recovery route and RBAC)
- execution step listing
- asynchronous workflow processor behavior
- the concurrent-finalization guard (worker does not overwrite a recovered
  execution)
- simulated step handlers
- controlled processing failures
- queue payload / retry behavior
- job status observability
- stale `RUNNING` execution recovery

Latest validation:

```txt
npm test                          # 139/139 passing
docker exec govflow_api npm test
docker exec govflow_api npm run db:migrate
```

End-to-end smoke against PostgreSQL confirmed the core concurrency guarantee: a
recovered `FAILED` execution is not overwritten by a later worker `COMPLETED`
attempt (the guarded finalize matches no rows and the execution stays `FAILED`).

## Design Notes

### Why Asynchronous Now

Sprint 4 proved the synchronous workflow lifecycle. Sprint 5 moves processing
off the request path so long-running and future external work (Jira, email,
webhooks) does not block the API, while keeping all processing rules centralized
in `workflowProcessor.service`.

### No Long Processing Transaction

The processor does not wrap the whole run in one transaction: failed steps must
stay persisted, status transitions must be traceable, and future external calls
should not happen inside a database transaction.

### Concurrency Model

- `claimPendingExecution` guards `PENDING -> RUNNING` (no double processing).
- `finalizeRunningExecution` and the recovery's guarded write protect terminal
  transitions (no lost updates between worker and recovery).

## Sprint 5 Result

GovFlow now has a realistic asynchronous processing foundation: it enqueues
jobs, processes them in a background worker, exposes job status, retries
technical failures, avoids retries for business failures, recovers stale
`RUNNING` executions, protects against duplicate and lost updates, and runs API,
PostgreSQL, Redis, and worker through Docker Compose.

## Future Work

```txt
Jira integration (transitions and comments)
Real workflow step handlers
External API timeout handling
Worker metrics
Queue dashboard / admin tooling
Automatic scheduled recovery
Optional removal of the temporary /enqueue alias
```
