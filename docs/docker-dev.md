# Docker Development Environment

This document covers the local Docker setup and the gotchas hardened in
**Sprint 5.2.2 — Docker Dev Environment Hardening**.

## Services

```txt
api       Node API (port 3000), bind-mounted source, runs `npm run dev`
worker    BullMQ worker, same image as api, runs `npm run worker:workflow-processing`
postgres  PostgreSQL 16 (port 5432)
redis     Redis 7 (port 6379)
```

## Environment variables

The `api` and `worker` services load variables in two layers:

1. `env_file: .env` — provides secrets and config that are NOT host-specific
   (`JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `LOGIN_RATE_LIMIT_*`,
   `WORKFLOW_EXECUTION_RUNNING_TIMEOUT_MINUTES`).
2. `environment:` block — overrides host-specific values so the container talks
   to the Docker network services: `DB_HOST=postgres`, `REDIS_HOST=redis`, etc.

`environment:` takes precedence over `env_file:`, so the Docker network values
always win even if `.env` points to `localhost` for non-Docker local runs.

> The application requires `JWT_SECRET` and the database variables at boot
> (`requireEnv`). Without them the process fails fast.

## Hot reload (nodemon)

The dev script uses **legacy polling**:

```json
{
  "scripts": {
    "dev": "nodemon -L src/server.js"
  }
}
```

On Windows + Docker bind mounts, filesystem change events from the host do not
reach the container, so plain `nodemon` never detects edits. `-L` forces polling
so saved `.js`/`.json` changes trigger a restart inside the container.

## Operational rules

- **Changing `.env` requires restarting both the API and the worker.** nodemon
  only watches `js,mjs,cjs,json`; it does not watch `.env`, and the worker is not
  run under nodemon at all. After editing `.env`:

  ```bash
  docker restart govflow_api govflow_worker
  ```

- **Changing `package.json` requires an image rebuild.** Dependencies live in
  the image (the `/app/node_modules` anonymous volume shadows the host's). The
  worker shares the API image, so rebuild both. After adding/removing a
  dependency:

  ```bash
  docker compose up -d --build api worker
  ```

- **Migrations / seeds** run inside the API container:

  ```bash
  docker exec govflow_api npm run db:migrate
  docker exec govflow_api npm run db:seed
  ```

## Worker service

The BullMQ worker runs as the `worker` service. It shares the API image but
starts with a different command and consumes jobs from the `workflow-processing`
queue:

```yaml
worker:
  build: .
  command: npm run worker:workflow-processing
  env_file:
    - .env
  environment:
    DB_HOST: postgres
    REDIS_HOST: redis
  depends_on:
    - postgres
    - redis
```

Notes:

- The worker is **not** run under nodemon, so it does not hot-reload. Restart it
  to pick up code changes during development:

  ```bash
  docker restart govflow_worker
  ```

- Follow worker logs (job started/completed/failed lines) with:

  ```bash
  docker compose logs -f worker
  ```

- Stale RUNNING executions can be recovered manually through the API container:

  ```bash
  docker exec govflow_api npm run workflow:recover-stale
  ```
