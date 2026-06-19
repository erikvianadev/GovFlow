# Production-like Docker Stack

GovFlow ships two Compose files:

| File | Purpose |
|---|---|
| `docker-compose.yml` | **Development only**: bind-mounted source, hot reload, Postgres/Redis ports published on the host, Redis without auth. |
| `docker-compose.prod.yml` | **Production-like**: hardened backing services and runtime. |

The dev file is unchanged in behavior and remains the default for local work.

## What the production-like stack hardens

- **`NODE_ENV=production`** for `api` and `worker` — generic error responses
  (see `docs/error-handling.md`) and enforced backing-service auth.
- **Redis requires a password** via `redis-server --requirepass ${REDIS_PASSWORD}`,
  and `api`/`worker` connect using `REDIS_PASSWORD`.
- **Postgres credentials come from the environment** (`DB_USER`, `DB_PASSWORD`,
  `DB_NAME`) — no hardcoded defaults.
- **No published host ports for Postgres or Redis.** They are reachable only on
  the internal Compose network via service DNS (`postgres`, `redis`). Only the
  API publishes `3000` (place it behind a reverse proxy / TLS in a real deploy).
- **No source bind-mount and no nodemon.** The app runs from the built image:
  `api` uses `npm start`, `worker` uses `npm run worker:workflow-processing`.

## Required environment variables

All sensitive values are supplied via the environment (an env file or your
orchestrator's secret store). The Compose file contains **no real values and no
insecure defaults**; a missing required variable aborts startup with an error.

| Variable | Notes |
|---|---|
| `JWT_SECRET` | >= 32 chars (enforced at boot). Generate: `openssl rand -base64 48`. |
| `REDIS_PASSWORD` | **Required** in production. Sets Redis `--requirepass` and the app connection. |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Postgres credentials; no defaults. Use strong, unique values. |
| `JIRA_*` | As needed for the Jira integration. |

> The `:?` syntax in `docker-compose.prod.yml` (e.g. `${REDIS_PASSWORD:?...}`)
> makes Compose fail fast if a required variable is unset.

## Bring up / tear down

```bash
# Validate the file without starting anything
docker compose -f docker-compose.prod.yml config

# Start the hardened stack
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations / seeds inside the API container
docker exec govflow_api npm run db:migrate
docker exec govflow_api npm run db:seed

# Tear down
docker compose -f docker-compose.prod.yml down
```

## Validating the hardening

```bash
# Redis is NOT reachable from the host (no published port) — this should fail:
redis-cli -h 127.0.0.1 -p 6379 ping

# Postgres is NOT reachable from the host (no published port) — this should fail:
psql -h 127.0.0.1 -p 5432 -U "$DB_USER" -d "$DB_NAME"

# Inside the network, Redis requires AUTH:
docker exec govflow_redis redis-cli ping                 # -> NOAUTH error
docker exec govflow_redis redis-cli -a "$REDIS_PASSWORD" ping   # -> PONG

# API health should report ok once DB/Redis are reachable internally:
curl -s http://127.0.0.1:3000/health
```

If `REDIS_PASSWORD` is omitted in production, both Compose (`:?`) and the
application boot (`config/env.js`) fail fast.
