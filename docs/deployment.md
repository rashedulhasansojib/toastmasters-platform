# Deployment runbook

Production is a **single self-hosted server running containers**, with **Postgres on Neon** and
Redis as a container alongside the apps. Deploys are automated: merge to `main`, the quality gate
goes green, GitHub Actions builds an image, and the server cuts over blue-green.

| Piece                   | Where                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Gate                    | `.github/workflows/quality.yml` (called by CI **and** Deploy) |
| Pipeline                | `.github/workflows/deploy.yml`                                |
| Image                   | `Dockerfile` + `infra/docker-entrypoint.sh`                   |
| What runs on the server | `infra/deploy/deploy.sh`                                      |
| Stack definition        | `infra/docker-compose.prod.yml`                               |
| TLS / routing           | `infra/Caddyfile` + `infra/active.conf`                       |
| Production config       | `<DEPLOY_PATH>/.env` — rendered by CI, **never in git**       |

```
push to main ──▶ quality (lint · typecheck · test · integration · build)
                    │ green only
                    ▼
                 build image ──▶ ghcr.io/<owner>/<repo>:<sha>
                    │
                    ▼
                 deploy ──ssh──▶ pull image
                                 prisma migrate deploy   (one-shot, DIRECT_URL)
                                 start the idle color
                                 health-gate api + dashboard
                                 flip active.conf + caddy reload
                                 recreate the worker
```

**A red gate produces no image, and an image is the only deployable thing.** Only one deploy runs
at a time, and an in-flight deploy is never cancelled by a newer push.

---

## 1. How the blue-green model works

Two full sets of app containers exist: `api-blue`/`dashboard-blue` and `api-green`/`dashboard-green`.
One set serves traffic; the other is the warm rollback target. Each deploy starts the **idle** set,
proves it healthy, then flips.

Caddy has exactly **one upstream: the dashboard**. The API is never published. Every browser request
already terminates at a Next.js route handler under `app/api/**`, which proxies to the API
server-side — so there is no public route to NestJS, and no CORS involved in normal traffic.

Colors are **paired**: `dashboard-blue` runs with `API_INTERNAL_URL=http://api-blue:4000`. Because
the dashboard is the only public upstream, flipping the single line in `active.conf` moves the whole
pair at once. There is no window in which a new dashboard talks to an old API.

`active.conf` is deploy **state**, not configuration. CI seeds it only when absent; `deploy.sh`
rewrites it in place at each cutover. It is rewritten with `>` and never `mv`, because it is
bind-mounted into the Caddy container and replacing the file would swap the inode out from under
the mount.

**The server holds no git checkout.** The image carries the built code. `DEPLOY_PATH` contains only
`docker-compose.prod.yml`, `Caddyfile`, `active.conf`, `deploy.sh` and `.env`.

---

## 2. One-time server setup

Assumes Ubuntu/Debian and a non-root deploy user (`deploy` below).

### 2.1 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy       # log out and back in for this to take effect
docker compose version               # confirm the v2 plugin is present
```

Nothing else is needed — no Node, no pnpm, no pm2. The build happens in CI.

### 2.2 Free ports 80 and 443

Caddy binds both and provisions TLS automatically. **If the box currently runs nginx or Apache,
stop and disable it first**, or Caddy will fail to bind and crash-loop:

```bash
sudo systemctl disable --now nginx    # or apache2
```

Point the `DOMAIN` DNS A/AAAA record at this server _before_ the first deploy — Caddy's first
certificate order happens on startup, and ACME needs the name to resolve here.

### 2.3 Deploy directory

```bash
sudo mkdir -p /srv/toastmasters-platform && sudo chown deploy:deploy /srv/toastmasters-platform
```

That is the whole setup. CI populates the directory on first deploy.

### 2.4 Memory

The apps have `mem_limit` ceilings and V8 heap caps so a runaway process is killed alone rather
than triggering a host-wide OOM. On a 2 GB box add swap for headroom:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Unlike the pm2 deploy this replaced, `next build` no longer runs on the server, so the build-OOM
failure mode is gone.

---

## 3. GitHub configuration

### 3.1 SSH access

```bash
# on your laptop
ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/tm_actions -N ''
ssh-copy-id -i ~/.ssh/tm_actions.pub deploy@your-server
ssh-keyscan -p 22 your-server            # output goes into DEPLOY_SSH_KNOWN_HOSTS
cat ~/.ssh/tm_actions                    # private key → DEPLOY_SSH_KEY
```

Host-key checking is **strict**. `DEPLOY_SSH_KNOWN_HOSTS` is not optional; the workflow fails fast
with a readable error rather than trusting whatever answers on that address.

### 3.2 Secrets

Repo ▸ Settings ▸ Secrets and variables ▸ Actions.

| Secret                   | Value                                        | Required |
| ------------------------ | -------------------------------------------- | -------- |
| `DEPLOY_SSH_KEY`         | Private key from `~/.ssh/tm_actions`         | yes      |
| `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan` output                         | yes      |
| `DEPLOY_HOST`            | Server hostname or IP                        | yes      |
| `DEPLOY_USER`            | `deploy`                                     | yes      |
| `DEPLOY_PATH`            | `/srv/toastmasters-platform`                 | yes      |
| `DEPLOY_PORT`            | SSH port, if not 22                          | no       |
| `DOMAIN`                 | Public hostname Caddy serves                 | yes      |
| `APP_URL`                | `https://your-domain`                        | yes      |
| `DATABASE_URL`           | Neon **pooled** endpoint (`-pooler` in host) | yes      |
| `DIRECT_URL`             | Neon **direct/unpooled** endpoint            | yes      |
| `SESSION_JWT_SECRET`     | `openssl rand -base64 48`                    | yes      |
| `S3_ENDPOINT`            | S3-compatible endpoint URL                   | yes      |
| `S3_BUCKET`              | Bucket name                                  | yes      |
| `S3_ACCESS_KEY_ID`       | Access key                                   | yes      |
| `S3_SECRET_ACCESS_KEY`   | Secret key                                   | yes      |
| `S3_REGION`              | Defaults to `us-east-1`                      | no       |
| `CORS_ORIGINS`           | Defaults to `APP_URL`                        | no       |
| `EMAIL_FROM`             | A real sending address                       | no       |

The **S3 group is required** even though `packages/config` marks those fields `.optional()`:
`S3StorageAdapter` is constructed eagerly at startup and throws unless all four are present, so the
API will not boot without them. (The schema is misleading here and is worth tightening — see
`docs/superpowers/specs/2026-07-31-container-deploy-design.md` §11.)

Mixing up the pooled and direct Neon URLs is the classic failure: the app hits the connection
ceiling, or `prisma migrate deploy` fails against the pooler (CLAUDE.md §3).

`REDIS_URL` is **not** a secret — it is the internal `redis://redis:6379`, written by the workflow.

Optionally create a **`production` environment** (Settings ▸ Environments) for a required reviewer
or branch restriction. The deploy job already targets it, so rules apply as soon as it exists.

### 3.3 How `.env` is produced

CI renders it from the secrets above on **every deploy**, pipes it over SSH under `umask 077`, and
moves it into place atomically. Consequences worth knowing:

- **GitHub is the source of truth.** A hand-edit on the server is overwritten by the next deploy.
- **A new variable needs both a secret and a workflow edit** — it will not appear by itself.
- The file is **not shell syntax**. Compose parses it and does not strip quotes, so nothing in it is
  quoted: `EMAIL_FROM=Name <a@b>`, never `EMAIL_FROM="Name <a@b>"`.
- Optional values are **omitted when empty** rather than written blank, because
  `packages/config` validates them as URLs and emails and an empty string fails that.

---

## 4. Everyday operations

### Deploying

Merge to `main`. The gate runs, an image is built and tagged with the commit SHA, and the server
cuts over.

Manual: **Actions ▸ Deploy ▸ Run workflow**, with an optional `ref` and a `seed` checkbox.

### Rollback

Deploy the previous good commit — same workflow, `ref` = that SHA:

```
Actions ▸ Deploy ▸ Run workflow ▸ ref: <previous-sha>
```

Because images are tagged by SHA, **a rollback does not rebuild**: the workflow detects the image
already in GHCR and skips straight to the cutover.

On the server, without GitHub:

```bash
cd /srv/toastmasters-platform
IMAGE_TAG=<previous-sha> ./deploy.sh
```

**Migrations do not roll back.** `prisma migrate deploy` only rolls forward, so a code rollback
across a schema change lands old code on a new schema. Keep migrations backward-compatible (add
columns nullable, drop them a release later) and that stays safe. This discipline is also what makes
the worker cutover safe — the worker is recreated after the flip, so for a few seconds old worker
code runs against the new schema. Recovering from a bad migration means a Neon branch/PITR restore
plus a forward fix, not a `git revert`.

### Why seeding is off by default

Reference vocabularies (resources, actions, role templates, Pathways paths, DCP goals) are
**editable in production without a deploy** (CLAUDE.md §10.6). A reseed re-upserts the shipped values
and would overwrite those edits, so it only runs when you ask — `seed: true` on a manual run, or
`RUN_SEED=true ./deploy.sh` on the server. Do ask for it after a release that adds new vocabulary.

### Logs and status

```bash
cd /srv/toastmasters-platform
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail 100 api-blue
docker compose -f docker-compose.prod.yml logs -f worker
cat active.conf            # which color is live
```

Logs are Pino JSON. Pipe through `pnpm exec pino-pretty` locally, or `docker compose logs ... | jq`.
Docker's `local` driver rotates by default; nothing extra is needed.

### Changing config without a code change

Update the secret in GitHub, then run **Actions ▸ Deploy ▸ Run workflow**. The `.env` is re-rendered
and the containers are recreated with the new values. Editing `.env` on the server works until the
next deploy overwrites it — treat that as a debugging tool, not a fix.

---

## 5. Troubleshooting

| Symptom                                                      | Cause / fix                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Host key verification failed`                               | `DEPLOY_SSH_KNOWN_HOSTS` is stale (server rebuilt / new IP). Re-run `ssh-keyscan` and update the secret.                                                                                                                                    |
| `Permission denied (publickey)`                              | The Actions **public** key isn't in `deploy@server:~/.ssh/authorized_keys`.                                                                                                                                                                 |
| `<var> is not set` at the render step                        | A required secret is missing. The error names it.                                                                                                                                                                                           |
| Health check fails but the app logs look fine                | **Check Caddy first.** The probe runs _inside_ the Caddy container, so a crash-looping Caddy reports as "api failed its health check". `docker compose logs caddy`.                                                                         |
| Caddy crash-loops on `unrecognized directive`                | A Caddyfile edit used a directive Caddy 2 doesn't have at that level. Validate before deploying: `docker run --rm -e DOMAIN=x -v $PWD/infra/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`. |
| Caddy can't bind :80/:443                                    | nginx/apache still running (§2.2), or another container holds the port.                                                                                                                                                                     |
| TLS certificate never issues                                 | DNS for `DOMAIN` doesn't resolve to this host, or 80/443 aren't reachable from the internet. ACME needs both.                                                                                                                               |
| API exits at boot with a DI stack trace about object storage | The `S3_*` secrets are missing — they are required (§3.2).                                                                                                                                                                                  |
| API exits with `Invalid environment configuration`           | `parseEnv()` fail-fast; it lists exactly which variables. This happens in the _target_ color, so the old one keeps serving.                                                                                                                 |
| `prisma migrate deploy` errors on a prepared statement       | `DIRECT_URL` is pointing at the Neon **pooler**. Use the unpooled endpoint.                                                                                                                                                                 |
| Deploy says "NOT flipping" and exits non-zero                | Working as intended — the new color failed its gate and the old one is still live. The failing service's last 60 log lines are in the run output.                                                                                           |
| Disk filling up                                              | `deploy.sh` prunes images older than 7 days. To reclaim now: `docker image prune -af`.                                                                                                                                                      |

---

## 6. Not built yet

Called out honestly rather than implied:

- **No automated database backups.** Neon has PITR on paid plans — confirm the retention window
  matches what a volunteer district can live with. This is the biggest remaining gap.
- **No staging environment.** Migrations meet production on their first real run; `pnpm test:int`
  (Testcontainers) is the only rehearsal a migration gets.
- **No uptime monitoring or alerting.** Point an external monitor at `https://your-domain/`.
- **Redis is not backed up.** It holds BullMQ queues and the permission cache — both rebuildable, so
  this is a deliberate choice rather than an oversight. In-flight jobs would be lost if the volume
  were destroyed.
