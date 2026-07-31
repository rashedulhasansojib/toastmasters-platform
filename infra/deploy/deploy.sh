#!/usr/bin/env bash
#
# Blue-green deploy for the single-host stack. Runs ON the server, invoked over
# SSH by .github/workflows/deploy.yml (or by hand from the deploy directory).
#
#   1. pull the image at IMAGE_TAG      6. health-gate BOTH target services
#   2. bring up redis + caddy           7. flip active.conf + graceful reload
#   3. one-shot migration               8. recreate the worker in place
#   4. work out the live color          9. optional seed, then prune
#   5. start the target color
#
# If either target service fails its health check, traffic is NOT flipped and
# this exits non-zero — the previous color keeps serving.
#
# Unlike the pm2 deploy this replaces, the server holds no git checkout: the
# image carries the built code. This directory needs only docker-compose.prod.yml,
# Caddyfile, active.conf, deploy.sh and .env.
#
# By hand:
#   cd /srv/toastmasters-platform && IMAGE_TAG=<sha> ./deploy.sh
#
# Env:
#   IMAGE_TAG   required — the image tag to deploy (CI passes the commit SHA)
#   RUN_SEED    optional — `true` also runs the reference-vocabulary seed
#
set -euo pipefail

: "${IMAGE_TAG:?IMAGE_TAG is required (the image tag to deploy)}"
RUN_SEED="${RUN_SEED:-false}"

# Resolve to this script's own directory so it works regardless of caller cwd.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export IMAGE_TAG
COMPOSE="docker compose -f docker-compose.prod.yml"

log() { printf '\n▸ %s\n' "$*"; }
fail() { printf '\n✖ %s\n' "$*" >&2; exit 1; }

# Checked first, and separately from .env: in git this script lives at
# infra/deploy/, but it runs from DEPLOY_PATH where everything sits flat. Running
# it straight out of a clone is the likely mistake, and without this it would
# surface as a confusing ".env is missing" instead of "wrong directory".
[[ -f docker-compose.prod.yml ]] || fail \
  "docker-compose.prod.yml is not in $(pwd).
   Run this from DEPLOY_PATH on the server (where deploy.sh, the compose file,
   Caddyfile, active.conf and .env sit flat together) — not from a repo checkout.
   See docs/deployment.md."

[[ -f .env ]] || fail '.env is missing. CI renders it from GitHub secrets on every deploy — see docs/deployment.md.'
[[ -f active.conf ]] || fail 'active.conf is missing. CI seeds it on first deploy — see docs/deployment.md.'

log "Deploying image tag: $IMAGE_TAG"
$COMPOSE pull api-blue api-green dashboard-blue dashboard-green worker

log 'Ensuring redis + caddy are up'
$COMPOSE up -d redis caddy

# Both colors share one Neon database, so migrations run exactly once, here —
# never from an app's startup path. Connects via DIRECT_URL (unpooled).
log 'Applying database migrations'
$COMPOSE --profile tools run --rm migrate

if [[ "$RUN_SEED" == 'true' ]]; then
  log 'Seeding reference vocabularies'
  $COMPOSE --profile tools run --rm -e ROLE=seed migrate
fi

# The live color is whatever Caddy is currently importing. Default to blue so a
# hand-mangled active.conf can't wedge the deploy.
CURRENT="$(grep -oE 'dashboard-(blue|green)' active.conf | head -1 | sed 's/dashboard-//' || true)"
CURRENT="${CURRENT:-blue}"
if [[ "$CURRENT" == 'blue' ]]; then TARGET='green'; else TARGET='blue'; fi
log "Live color: $CURRENT  ->  deploying to: $TARGET"

log "Starting api-$TARGET and dashboard-$TARGET"
$COMPOSE up -d --force-recreate "api-$TARGET" "dashboard-$TARGET"

# Probe from INSIDE the caddy container: the app services are not published to
# the host, so they are only reachable on the compose network. `compose exec`
# (service name), not `docker exec` — the real container is <project>-caddy-1.
probe() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 45); do
    if $COMPOSE exec -T caddy wget -q --spider --timeout=5 "$url" >/dev/null 2>&1; then
      printf '    ✔ %s healthy after %s attempt(s)\n' "$name" "$attempt"
      return 0
    fi
    sleep 2
  done
  printf '\n--- %s logs ---\n' "$name" >&2
  $COMPOSE logs --tail 60 "$name" >&2 || true
  return 1
}

log "Health-gating the $TARGET color"
# The API first, then the dashboard. The dashboard's own home page fetches the
# API server-side, so a green dashboard probe also proves the color is correctly
# paired — a dashboard talking to a dead API fails here rather than after cutover.
probe "api-$TARGET" "http://api-$TARGET:4000/health" \
  || fail "api-$TARGET failed its health check. NOT flipping; $CURRENT is still live."
probe "dashboard-$TARGET" "http://dashboard-$TARGET:3000/" \
  || fail "dashboard-$TARGET failed its health check. NOT flipping; $CURRENT is still live."

log "Flipping traffic to dashboard-$TARGET"
# Rewritten IN PLACE, never `mv`: active.conf is bind-mounted into the caddy
# container and replacing it would swap the inode out from under the mount.
printf 'reverse_proxy dashboard-%s:3000\n' "$TARGET" > active.conf
$COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile

# Recreated after the flip, and deliberately not coloured: BullMQ repeatable and
# scheduled jobs (the 1-July rollover, snapshots, digests) need exactly one
# scheduler, so two live workers would double-run them. For the few seconds this
# takes, old worker code runs against the new schema — which is safe precisely
# because migrations are kept backward-compatible (see docs/deployment.md).
log 'Recreating the worker (singleton)'
$COMPOSE up -d --force-recreate worker

log 'Pruning images older than 7 days'
docker image prune -af --filter 'until=168h' || true

log "Deploy complete. Live color: $TARGET"
$COMPOSE ps
