# Rate Limiting & Trust Proxy

GovFlow throttles abuse-prone endpoints per client IP using
[`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit).
This document describes the limiters, their defaults, the 429 response and the
`trust proxy` configuration that makes per-IP limiting correct behind a proxy.

## Limiters

Each limiter is **per IP**. Windows are configurable in milliseconds and the
maximum number of requests per window is configurable too. All values have safe
defaults, so the app works out of the box without any extra configuration.

| Limiter | Protected routes | Default window | Default max | Env vars |
|---|---|---|---|---|
| Login | `POST /auth/login` | 15 min | 10 | `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX` |
| Mutating writes | `POST /users`, `POST /workflows/:workflowId/executions` | 15 min | 50 | `MUTATING_RATE_LIMIT_WINDOW_MS`, `MUTATING_RATE_LIMIT_MAX` |
| Workflow processing | `POST /workflow-executions/:id/process`, `POST /workflow-executions/:id/enqueue` | 15 min | 60 | `PROCESSING_RATE_LIMIT_WINDOW_MS`, `PROCESSING_RATE_LIMIT_MAX` |
| Jira connectivity | `GET /jira/test-connection` | 15 min | 30 | `JIRA_RATE_LIMIT_WINDOW_MS`, `JIRA_RATE_LIMIT_MAX` |
| Admin operations | `POST /workflow-executions/recovery/stale-running` | 15 min | 20 | `ADMIN_RATE_LIMIT_WINDOW_MS`, `ADMIN_RATE_LIMIT_MAX` |

The limiter runs **before** authentication on each route, so abusive traffic is
rejected before any JWT verification or database lookup happens.

## 429 response

When a client exceeds a limiter, the request is rejected with HTTP **429 Too
Many Requests** and a generic JSON body (no internal details are leaked):

```json
{
  "success": false,
  "message": "Too many requests, please try again later"
}
```

The exact `message` depends on the limiter (e.g. login, processing, Jira), but
the shape (`success: false` + generic `message`) is always the same. Standard
rate-limit headers (`RateLimit-*`) are sent; legacy `X-RateLimit-*` headers are
disabled.

## Trust proxy

Per-IP rate limiting only works if the app sees the **real client IP**. Behind a
reverse proxy, the immediate connection comes from the proxy, so Express must be
told how many trusted proxies forward the request (it then reads the client IP
from `X-Forwarded-For`).

This is controlled by `TRUST_PROXY_HOPS` (Express `trust proxy`), an **integer**
equal to the number of trusted proxies in front of the API:

- `TRUST_PROXY_HOPS=0` — **default.** The API is exposed directly to clients
  (no reverse proxy). This is the case for `docker-compose.prod.yml`, which
  publishes the API directly on port `3000`.
- `TRUST_PROXY_HOPS=1` — use **only** when there is exactly **one** trusted
  reverse proxy (e.g. nginx, an ALB) in front of the API.
- The value must reflect **exactly** the number of trusted proxies. Setting it
  higher than the real number lets clients inject extra `X-Forwarded-For`
  entries and spoof their IP, defeating the rate limiter.

> **Never set trust proxy to `true`.** Trusting every proxy makes the client IP
> fully spoofable via `X-Forwarded-For`, which would let an attacker bypass all
> per-IP rate limiting. For that reason the configuration only accepts a
> non-negative integer; any non-integer, negative or `"true"` value falls back
> to the safe default `0`.
