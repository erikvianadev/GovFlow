# Docker Development Environment

This document covers the local Docker setup and the gotchas hardened in
**Sprint 5.2.2 — Docker Dev Environment Hardening**.

## Services

```txt
api       Node API (port 3000), bind-mounted source, runs `npm run dev`
postgres  PostgreSQL 16 (port 5432)
redis     Redis 7 (port 6379)
```

## Environment variables

The `api` service loads variables in two layers:

1. `env_file: .env` — provides secrets and config that are NOT host-specific
   (`JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `LOGIN_RATE_LIMIT_*`).
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

- **Changing `.env` requires a container restart.** nodemon only watches
  `js,mjs,cjs,json`; it does not watch `.env`. After editing `.env`:

  ```bash
  docker restart govflow_api
  ```

- **Changing `package.json` requires an image rebuild.** Dependencies live in
  the image (the `/app/node_modules` anonymous volume shadows the host's). After
  adding/removing a dependency:

  ```bash
  docker compose up -d --build api
  ```

- **Migrations / seeds** run inside the container:

  ```bash
  docker exec govflow_api npm run db:migrate
  docker exec govflow_api npm run db:seed
  ```

## Future worker service (Sprint 5.3)

When the BullMQ worker is introduced, its service must also load `.env`:

```yaml
worker:
  build: .
  env_file:
    - .env
  environment:
    DB_HOST: postgres
    REDIS_HOST: redis
  depends_on:
    - postgres
    - redis
```
