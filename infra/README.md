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

Default credentials match `.env.example`. Production uses Neon (Postgres) and an
S3-compatible bucket; nothing here is meant for production.

Production runs the three apps under **pm2** on a single server, against Neon
(Postgres) and managed Redis — no containers. See `../docs/deployment.md` for the
runbook, `deploy/deploy.sh` for what a deploy actually does, and
`deploy/ecosystem.config.cjs` for the pm2 process definitions.
