# Error Handling & `NODE_ENV`

GovFlow centralizes error handling in a single Express error middleware
(`src/middlewares/error.middleware.js`). The shape of an error **response** is
driven by two things:

1. Whether the error is **operational** (`error.isOperational === true`).
2. The resolved `NODE_ENV` (`env.app.nodeEnv`).

## `NODE_ENV` resolution

`NODE_ENV` is resolved and validated in `src/config/env.js`:

- Allowed values: `development`, `test`, `production`.
- If unset, it **defaults to `production`** (the safe default) so a
  misconfigured deployment never silently leaks development error details.
- Any other value fails fast at boot.

## Operational vs non-operational errors

- **Operational** errors are raised intentionally by the application and carry
  trustworthy metadata: `AppError`, `JiraBusinessError`. Their `statusCode`,
  `message`, and validation `errors` are safe to return to the client.
- **Non-operational** errors are unexpected runtime/third-party failures
  (e.g. a driver or network error, or a `JiraTechnicalError`). Their metadata
  is **not** trusted: the response is forced to `500` with a generic message,
  and no `errors`/`details` are returned. This prevents an arbitrary error from
  dictating the HTTP status or leaking internal structure.

### Exposable framework HTTP errors

One controlled exception: well-formed **HTTP client errors (4xx)** that follow
the `http-errors` convention used by Express body-parser mark themselves
`expose: true` (e.g. `PayloadTooLargeError` 413 for oversized bodies, or a
malformed-JSON `400`). These carry a safe, client-facing status and message, so
their `statusCode` and `message` are passed through. The application-specific
`errors` array is still only ever returned for our own operational errors, and
the `expose` flag never lets a `5xx` status through (those are always masked to
`500`).

## Response contract by environment

| Error kind | `statusCode` | `message` | `errors` | `details` (`name`/`message`/`stack`) |
|---|---|---|---|---|
| Operational — any env | `error.statusCode` | `error.message` | `error.errors` | only in `development` |
| Non-operational — `development` | `500` | `"Internal server error"` | omitted | present (debug aid) |
| Non-operational — `test` / `production` | `500` | `"Internal server error"` | omitted | omitted |

`details` (including the **stack trace**) is therefore only ever present when
`NODE_ENV=development`. In `test` and `production` the response body never
includes `name`, `message`, or `stack` from the underlying error.

## Server-side logging

The full error (including stack) is always logged server-side via
`console.error(error)`. This is internal only and never reaches the client.

> Note: deployment-time enforcement of `NODE_ENV=production` (and the
> dev/prod compose split) is handled separately as part of the Docker/backing
> services hardening, not by this middleware.
