#!/usr/bin/env bash
# Selects which process this container runs. One image serves every role; the
# compose file sets ROLE per service.
#
#   api        the NestJS HTTP API            (internal only, port 4000)
#   worker     the BullMQ processors          (singleton — never run two)
#   dashboard  the Next.js app                (the only service Caddy fronts)
#   migrate    one-shot `prisma migrate deploy`, then exit
#   seed       one-shot reference-vocabulary seed, then exit
#
# Every long-running role is started with `exec` so the process becomes PID 1
# and receives SIGTERM directly — NestJS calls enableShutdownHooks() and needs
# the signal to drain in-flight work and close its Prisma/Redis connections.
set -euo pipefail

ROLE="${ROLE:-api}"

case "$ROLE" in
  api)
    exec node apps/api/dist/main.js
    ;;

  worker)
    exec node apps/worker/dist/main.js
    ;;

  dashboard)
    # cd first: `next start` resolves .next relative to the working directory.
    # Invoked through next's own entry rather than `pnpm start`, so signals
    # reach the real process instead of a package-manager wrapper.
    cd apps/dashboard
    exec node node_modules/next/dist/bin/next start --port "${DASHBOARD_PORT:-3000}"
    ;;

  migrate)
    # Connects through DIRECT_URL (the unpooled Neon endpoint) via
    # packages/db/prisma.config.ts. Runs once per deploy, before cutover —
    # both colors share one database, so this must not be in an app's startup.
    exec pnpm db:deploy
    ;;

  seed)
    # Off by default. Reference vocabularies are editable in production without
    # a deploy (CLAUDE.md §10.6), so a reseed overwrites those edits.
    exec pnpm db:seed
    ;;

  *)
    echo "entrypoint: unknown ROLE '$ROLE' (expected api|worker|dashboard|migrate|seed)" >&2
    exit 1
    ;;
esac
