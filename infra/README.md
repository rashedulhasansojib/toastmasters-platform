# infra

Local development backing services.

```bash
docker compose -f infra/docker-compose.yml up -d   # start
docker compose -f infra/docker-compose.yml down     # stop
docker compose -f infra/docker-compose.yml down -v  # stop + wipe volumes
```

| Service  | Port(s)     | Notes                                              |
| -------- | ----------- | -------------------------------------------------- |
| postgres | 5432        | `ltree` is enabled by the initial Prisma migration |
| redis    | 6379        | BullMQ queues + cache                              |
| minio    | 9000 / 9001 | S3-compatible object storage; console on 9001      |

Default credentials match `.env.example`. Nothing here is meant for production.

## Production

A single self-hosted server running containers, blue-green, against **Neon**
(Postgres) and an S3-compatible bucket. Redis runs as a container beside the apps.

| File                      | What it is                                                                |
| ------------------------- | ------------------------------------------------------------------------- |
| `../Dockerfile`           | One image, four roles — see `docker-entrypoint.sh`                        |
| `docker-entrypoint.sh`    | Selects `api` / `worker` / `dashboard` / `migrate` / `seed`               |
| `docker-compose.prod.yml` | The stack: two colors, a worker, redis, caddy                             |
| `Caddyfile`               | TLS + reverse proxy; imports `active.conf`                                |
| `active.conf`             | Deploy **state** — which color is live. Seed only; CI never overwrites it |
| `deploy/deploy.sh`        | Runs on the server: pull, migrate, health-gate, flip, recreate            |

These files live here in git but land **flat in `DEPLOY_PATH`** on the server —
the server keeps no git checkout, because the image carries the built code.

See `../docs/deployment.md` for the runbook and
`../docs/superpowers/specs/2026-07-31-container-deploy-design.md` for why it is
shaped this way.

Before changing the Caddyfile, validate it — a bad directive crash-loops the
proxy, and because the deploy's health probe runs _inside_ Caddy, the failure
reports misleadingly as an app health-check failure:

```bash
docker run --rm -e DOMAIN=localhost \
  -v "$PWD/infra/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$PWD/infra/active.conf:/etc/caddy/active.conf:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```
