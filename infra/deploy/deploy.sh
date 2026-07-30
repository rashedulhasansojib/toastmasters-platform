#!/usr/bin/env bash
#
# Production deploy — runs ON the server, from the repo root.
#
# The caller (.github/workflows/deploy.yml, or you by hand) has already moved
# the working tree to the commit being deployed; this script takes it from
# there: install, build, migrate, reload pm2, prove it's alive.
#
# By hand:
#   cd /srv/toastmasters-platform && ./infra/deploy/deploy.sh
#
# Env knobs:
#   RUN_SEED=true   also run `pnpm db:seed` (reference vocabularies). Off by
#                   default: the catalogues are editable in production without a
#                   deploy, and a reseed would overwrite those edits.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

RUN_SEED="${RUN_SEED:-false}"

log() { printf '\n▸ %s\n' "$*"; }
fail() { printf '\n✖ %s\n' "$*" >&2; exit 1; }

if [[ ! -f .env ]]; then
  fail "$ROOT/.env is missing. Production config lives there and is never in git — see docs/deployment.md."
fi

# Export the server's production config so that:
#   • `next build` bakes NEXT_PUBLIC_* into the client bundle,
#   • `prisma migrate deploy` sees DIRECT_URL (the unpooled endpoint),
#   • `pm2 reload --update-env` hands the same values to every process.
log 'Loading .env'
set -a
# shellcheck disable=SC1091
source ./.env
set +a

export NODE_ENV=production
export CI=1
export HUSKY=0 # no git hooks on the server
export NEXT_TELEMETRY_DISABLED=1
export TURBO_TELEMETRY_DISABLED=1

command -v pnpm >/dev/null 2>&1 || fail 'pnpm not on PATH. Enable it with `corepack enable pnpm` — see docs/deployment.md.'
command -v pm2 >/dev/null 2>&1 || fail 'pm2 not on PATH. `npm i -g pm2` — see docs/deployment.md.'

log "Deploying $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

log 'Installing dependencies'
pnpm install --frozen-lockfile

# Build before touching the database: a compile failure then costs nothing.
# `pnpm build` is turbo, so packages/* (including `prisma generate`) build first.
log 'Building api, worker, dashboard'
pnpm build

log 'Applying database migrations'
pnpm db:deploy

if [[ "$RUN_SEED" == 'true' ]]; then
  log 'Seeding reference vocabularies'
  pnpm db:seed
fi

log 'Reloading pm2 processes'
pm2 startOrReload infra/deploy/ecosystem.config.cjs --update-env
# Persist the process list + env so a server reboot brings everything back.
pm2 save

log 'Waiting for health'
api_url="http://127.0.0.1:${API_PORT:-4000}/health"
dashboard_url="http://127.0.0.1:${DASHBOARD_PORT:-3000}/"

wait_for() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 20); do
    if curl -fsS --max-time 5 -o /dev/null "$url"; then
      printf '  ✔ %s (%s)\n' "$name" "$url"
      return 0
    fi
    sleep 2
  done
  printf '\n--- pm2 status ---\n' >&2
  pm2 list >&2 || true
  printf '\n--- last 60 log lines ---\n' >&2
  pm2 logs --nostream --lines 60 >&2 || true
  fail "$name did not become healthy at $url after 40s. Nothing was rolled back — the previous commit is $(git rev-parse --short 'HEAD@{1}' 2>/dev/null || echo 'in `git reflog`'); see docs/deployment.md#rollback."
}

wait_for 'api' "$api_url"
wait_for 'dashboard' "$dashboard_url"

log 'Deployed'
pm2 list
