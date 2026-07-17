# Jira Errors: Operator Guide

This document explains, from an operator's point of view, what each Jira
error means, what to do about it, and when GovFlow retries automatically
versus when a human has to act. It reflects the real behavior implemented in
`src/modules/jira/jira.service.js` (`normalizeJiraError`,
`assertJiraIntegrationReady`) and `src/modules/jira/jira.errors.js`
(`JiraBusinessError`, `JiraTechnicalError`) as of Sprint 6.5.1 (boot
validation) and 6.5.2 (per-status business error messages). It does not cover
the general error-response contract (`isOperational`, `NODE_ENV`-dependent
response shape) — see [`docs/error-handling.md`](error-handling.md) for that,
and [`docs/jira-idempotency.md`](jira-idempotency.md) for how retries interact
with step idempotency.

## Where a Jira error can come from

There are three distinct sources, and they are handled differently:

1. **Local preconditions**, checked before any Jira HTTP call —
   `assertJiraIntegrationReady()`, called by `addCommentToIssue` and
   `transitionIssue`.
2. **Jira's HTTP response to a real API call**, normalized by
   `normalizeJiraError(error, operation)` — used by `addCommentToIssue`,
   `transitionIssue`, and `testConnection`.
3. **Local step configuration validation**, in
   `src/modules/workflow-processing/workflowStepHandlers.js` — raised before
   `jira.service.js` is even called, when a `JIRA_TRANSITION`/`JIRA_COMMENT`
   step's `configuration` fails `validateJiraTransitionConfiguration` /
   `validateJiraCommentConfiguration`.

`testConnection` (backing `GET /jira/test-connection`) is a partial exception:
its own precondition checks (lines 32–45 of `jira.service.js`) use plain
`AppError`, not `JiraBusinessError`/`JiraTechnicalError` — only failures from
the actual `getMyself()` call go through `normalizeJiraError`. This is an
existing asymmetry with `assertJiraIntegrationReady` (used by the two
step-processing calls); it is documented here as observed fact, not something
this sprint changes. Both `testConnection` and `assertJiraIntegrationReady`
resolve the same 3 preconditions (in the same order) through a shared private
helper, `checkJiraReadiness()`, which only reports which precondition failed
(or that all are satisfied) — it does not decide the error class or message,
so the `AppError` vs. `JiraTechnicalError`/`JiraBusinessError` split described
above and in the table below is unchanged.

## Status-by-status table (Jira HTTP responses, via `normalizeJiraError`)

| Jira HTTP status | Error type | Message shown to the operator (`{operation}` is `"comment"`, `"transition"`, or `"test connection"`) | Likely cause | Recommended operator action |
| --- | --- | --- | --- | --- |
| 400 | `JiraBusinessError` (retry: manual) | `Jira rejected the {operation} request as a bad request (status 400): check the request payload` | Malformed request — e.g. invalid ADF body, bad transition id shape | Check the workflow step's `configuration` (issue key, transition id, comment text) and Jira's own `response.data` in the server log for the specific field Jira rejected |
| 401 | `JiraBusinessError` (retry: manual) | `Jira rejected the {operation} request: invalid or expired Jira credentials (status 401)` | `JIRA_EMAIL`/`JIRA_API_TOKEN` wrong, revoked, or expired | Rotate/verify the Jira API token and email in the environment, then manually re-trigger the failed step/execution |
| 403 | `JiraBusinessError` (retry: manual) | `Jira rejected the {operation} request: credentials are valid but lack permission for this project/resource (status 403)` | Credentials are valid but the Jira user lacks permission on the target project/issue | Grant the Jira account the required project/issue permission, then manually re-trigger |
| 404 | `JiraBusinessError` (retry: manual) | `Jira rejected the {operation} request: resource not found (status 404)` | Issue key or transition id does not exist (typo, deleted issue, wrong project) | Verify the issue key / transition id used in the workflow step configuration |
| 429 | `JiraTechnicalError` (retry: automatic) | `Temporary Jira {operation} request failure` | Jira rate limit hit | No action needed for a single occurrence; if it recurs constantly, review call volume / `JIRA_RATE_LIMIT_WINDOW_MS` and `JIRA_RATE_LIMIT_MAX` |
| 5xx | `JiraTechnicalError` (retry: automatic) | `Temporary Jira {operation} request failure` | Jira Cloud is having a server-side issue | No action needed; check Atlassian's status page if it persists across retries |
| Network failure (`error.code` set, e.g. timeout/DNS, or no `error.response` at all) | `JiraTechnicalError` (retry: automatic) | `Temporary Jira {operation} request failure` | Network/DNS issue, connection timeout (`JIRA_TIMEOUT_MS`), Jira unreachable | No action for a transient blip; if persistent, check `JIRA_BASE_URL`, network egress, and `JIRA_TIMEOUT_MS` |
| 408 | `JiraTechnicalError` (retry: automatic) | `Temporary Jira {operation} request failure` | Request Timeout — Jira (or the network path to it) did not respond in time | No action needed for a single occurrence; if it recurs constantly, check `JIRA_TIMEOUT_MS` and network latency. **Deliberate carve-out:** 408 is a 4xx status, but unlike the "any other 4xx" row below it is kept retryable on purpose — a request timeout is, by definition, a transient condition, so `normalizeJiraError` explicitly excludes it (via `JIRA_RETRYABLE_4XX_STATUSES`) from the unmapped-4xx-is-non-retryable rule. |
| Any other 4xx Jira status not in the table above and not 408/429 (e.g. 402, 405, 410, 422, …) | `JiraBusinessError` (retry: manual), `statusCode` set to the real status | `Jira rejected the {operation} request with an unexpected status (status {status}): treat as non-retryable and inspect the response` | Not individually mapped by `normalizeJiraError`, but still a 4xx — Jira is rejecting the request as sent | Inspect `error.cause`/`responseData` in the server log for the specific reason Jira gave, and the workflow step's `configuration`; a 4xx is a rejection of the request itself, so a bare retry is very unlikely to succeed and this is treated as non-retryable, requiring manual follow-up |

**Note:** unmapped 4xx statuses used to fall through to the generic
`JiraTechnicalError` ("unexpected failure") branch and were therefore
retried automatically, even though a 4xx is a rejection of the request
itself and a bare retry was very unlikely to ever succeed differently. This
is no longer the case: any unmapped 4xx is now `JiraBusinessError`
(non-retryable), with the sole deliberate exception of 408 (see row above),
which stays retryable because it is definitionally transient.

The exact matching logic lives in `JIRA_BUSINESS_ERROR_MESSAGE_BY_STATUS`,
`JIRA_RETRYABLE_4XX_STATUSES`, and the fallback branches of
`normalizeJiraError` in `jira.service.js`.

## Preconditions checked before any Jira call (`assertJiraIntegrationReady`)

Used by `addCommentToIssue` and `transitionIssue` (not by `testConnection`,
see above):

| Condition | Error type | Message | Operator action |
| --- | --- | --- | --- |
| `jiraClient` failed to construct | `JiraTechnicalError` (retry: automatic) | `Jira client not available` | Should not occur if Sprint 6.5.1's boot validation passed. If seen, treat as an unexpected startup/config problem and investigate the process logs directly. |
| `JIRA_ENABLED=false` | `JiraBusinessError`, statusCode 400 (retry: manual) | `Jira integration is disabled` | Expected if Jira steps are configured while the integration is intentionally off. Enable `JIRA_ENABLED` (and configure the required vars) if Jira steps should run, or remove/avoid `JIRA_*` steps while it stays disabled. |
| `JIRA_ENABLED=true` but `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` missing | `JiraTechnicalError` (retry: automatic) | `Jira integration is not configured` | Since Sprint 6.5.1, `src/config/env.js` fails the process at **boot** when `JIRA_ENABLED=true` and any of these three vars is missing, so this runtime path should be unreachable in normal operation. If it is hit anyway, it is a defense-in-depth safety net, not an expected path — treat it as a signal that boot validation was bypassed (e.g. env changed after boot without a restart) and investigate the environment rather than waiting for a retry to fix it. |

## Local step configuration validation (not a Jira HTTP response at all)

Raised in `workflowStepHandlers.js`, before `jira.service.js` is called:

| Condition | Error type | Message | Operator action |
| --- | --- | --- | --- |
| `JIRA_TRANSITION` step configuration fails validation | `JiraBusinessError`, statusCode 400 (retry: manual) | `Invalid JIRA_TRANSITION configuration` | Fix the workflow step's `configuration` (missing/invalid `issueKey` or `transitionId`) — this never reaches Jira, so nothing on the Jira side needs to change |
| `JIRA_COMMENT` step configuration fails validation | `JiraBusinessError`, statusCode 400 (retry: manual) | `Invalid JIRA_COMMENT configuration` | Fix the workflow step's `configuration` (missing/invalid `issueKey` or `comment`) |

## `JiraBusinessError` vs `JiraTechnicalError`: automatic retry or manual action?

The two classes (`src/modules/jira/jira.errors.js`) carry different flags that
different parts of GovFlow read for different purposes:

| Flag | `JiraBusinessError` | `JiraTechnicalError` |
| --- | --- | --- |
| `isOperational` | `true` | not set (`undefined`) |
| `isBusinessFailure` | `true` | not set |
| `isRetryable` | not set | `true` |
| `statusCode` | set (e.g. 400/401/403/404) | not applicable (no `statusCode` field) |
| `cause` | not applicable | sanitized diagnostic object (`message`, `code`, `status`, `responseData` only — never `config`/`request`/headers, so the Jira Basic Auth credential never leaks) |

These flags are consumed in two different places, with different effects:

### 1. Inside workflow step processing (BullMQ worker)

`src/modules/workflow-processing/workflowProcessor.service.js` only checks
**`error.isRetryable === true`** when a step handler throws (line ~270):

- **`JiraTechnicalError` → automatic retry.** The step is reverted to
  `PENDING` and the error is rethrown, so BullMQ retries the job. The queue
  (`src/queues/workflowProcessing.queue.js`) is configured with `attempts: 3`
  and `backoff: { type: "exponential", delay: 3000 }` — up to 3 attempts
  total, with an exponential backoff based on a 3000ms base delay (BullMQ
  computes the exact per-attempt wait from that base; this doc does not
  restate BullMQ's internal formula to avoid guessing at it). Only the failed
  step is re-claimed on retry — already-`COMPLETED` steps are skipped (see
  `docs/jira-idempotency.md`).
- **`JiraBusinessError` → no automatic retry.** `isRetryable` is not set on
  it, so the processor takes the terminal branch: the step is marked `FAILED`,
  the execution is finalized `FAILED`, and the error is **not** rethrown to
  BullMQ — the job itself does not fail/retry. **A human has to act**: fix
  whatever the message says (credentials, permissions, payload, disabled
  integration, invalid step configuration) and manually re-trigger the work
  (e.g. re-run/re-process the execution) — GovFlow will not retry this on its
  own.

### 2. In an HTTP response (e.g. `GET /jira/test-connection`)

`src/middlewares/error.middleware.js` only checks **`error.isOperational ===
true`** to decide whether to trust `statusCode`/`message`:

- **`JiraBusinessError` → real status and message returned to the caller**
  (e.g. a 401 response with the "invalid or expired Jira credentials"
  message), because it is operational.
- **`JiraTechnicalError` → forced to a generic `500 Internal server error`**
  in the HTTP response, regardless of the real cause, because it is *not*
  flagged operational. The real cause (`error.cause` — sanitized `message`,
  `code`, `status`, `responseData`) is only visible in the server-side log
  entry (`logger.error({ err: normalizedError }, ...)`), never in the client
  response. See `docs/error-handling.md` for the full operational/non-operational
  response contract.

### Summary

| Error type | Retry | Where retry happens | Operator action required |
| --- | --- | --- | --- |
| `JiraBusinessError` | Manual | none (GovFlow does not retry) | Yes — fix the underlying cause (credentials, permissions, payload, config, disabled integration) and manually re-trigger |
| `JiraTechnicalError` | Automatic | BullMQ, up to 3 attempts with exponential backoff (workflow processing only) | No, unless the automatic retries are exhausted or the failure is persistent (rate limiting, Jira outage, network/DNS) |

## What is not covered / not verified here

- The exact per-attempt delay progression BullMQ computes from `delay: 3000`
  with `type: "exponential"` is a BullMQ library behavior, not GovFlow code;
  this doc intentionally does not restate a specific multiplier/formula to
  avoid asserting BullMQ internals that were not directly verified against the
  installed `bullmq` version's source.
- What happens after all 3 BullMQ attempts are exhausted for a
  `JiraTechnicalError` (e.g. whether the execution is left `RUNNING`
  indefinitely or picked up by stale-running recovery) is covered by
  `docs/jira-idempotency.md`, not repeated here.
