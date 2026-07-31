# Deployment runbook

Production is a **single self-hosted server** running the three apps under **pm2**, with
**Postgres on Neon** and **managed Redis**. Deploys are automated: merge to `main`, CI goes
green, GitHub Actions SSHes in and rolls the release.

| Piece                   | Where                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Pipeline                | `.github/workflows/ci.yml` (gate) → `.github/workflows/deploy.yml`                                      |
| What runs on the server | `infra/deploy/deploy.sh`                                                                                |
| Process definitions     | `infra/deploy/ecosystem.config.cjs`                                                                     |
| Production config       | `PRODUCTION_ENV_FILE` GitHub secret, written to `<repo>/.env` on the server every deploy — never in git |

```
push to main ──▶ CI (lint · typecheck · test · build · gitleaks)
                    │ green only
                    ▼
                 Deploy ──ssh──▶ write .env from PRODUCTION_ENV_FILE
                                 git reset --hard <sha>
                                 pnpm install --frozen-lockfile
                                 pnpm build
                                 pnpm db:deploy        (prisma migrate deploy)
                                 pm2 startOrReload --update-env
                                 curl /health          (fails the run if dead)
```

A red CI never reaches the server. Only one deploy runs at a time, and an in-flight deploy is
never cancelled by a newer push — the newer one queues.

---

## 1. One-time server setup

Assumes Ubuntu/Debian and a non-root deploy user (`deploy` below). Everything runs as that
user; nothing here needs root after the packages are installed.

### 1.1 Toolchain

```bash
# Node 22 (matches .nvmrc and engines.node >=22.12.0)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git curl

# pnpm 11.17.0 comes from the repo's packageManager field
sudo corepack enable pnpm

# pm2, and have it come back after a reboot
sudo npm install -g pm2
pm2 startup            # prints a sudo command — run it
```

`next build` is the memory-hungry step. On a 1–2 GB box give it swap and a heap cap, or the
build gets OOM-killed mid-deploy:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# and in the server's .env:  NODE_OPTIONS=--max-old-space-size=1536
```

### 1.2 Clone the repo

The server pulls from GitHub, so it needs read access. Add a **read-only deploy key**
(Repo ▸ Settings ▸ Deploy keys) — this is a _different_ key from the one Actions uses to SSH in.

```bash
sudo mkdir -p /srv && sudo chown deploy:deploy /srv
ssh-keygen -t ed25519 -C 'toastmasters-server-readonly' -f ~/.ssh/github_deploy -N ''
cat ~/.ssh/github_deploy.pub          # paste into GitHub as a read-only deploy key

cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

git clone git@github.com:rashedulhasansojib/toastmasters-platform.git /srv/toastmasters-platform
```

### 1.3 Production `.env`

`infra/deploy/deploy.sh` **sources** this file, so it must be plain `KEY=value` shell syntax:
no inline `#` comments after a value, and quote anything containing spaces.

Once Actions is wired up (§2), the `PRODUCTION_ENV_FILE` secret is the source of truth — the
Deploy workflow overwrites `<repo>/.env` on the server from that secret on **every** run, before
`deploy.sh` even starts. Hand-editing `.env` on the box only survives until the next deploy;
change the secret instead. This section is only for getting a first `.env` onto the server so
§1.5's by-hand deploy has something to source, before Actions has ever run.

```bash
cd /srv/toastmasters-platform
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

What must change from the example:

| Variable              | Production value                                                    |
| --------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`            | `production`                                                        |
| `APP_URL`             | `https://your-domain` — the dashboard's public origin               |
| `DATABASE_URL`        | Neon **pooled** endpoint (`-pooler` in the host)                    |
| `DIRECT_URL`          | Neon **direct/unpooled** endpoint — migrations use this             |
| `REDIS_URL`           | Managed Redis, `rediss://…` (TLS)                                   |
| `SESSION_JWT_SECRET`  | `openssl rand -base64 48`                                           |
| `CORS_ORIGINS`        | `https://your-domain` (the dashboard origin, comma-separated list)  |
| `S3_*`                | Real S3-compatible bucket + credentials                             |
| `EMAIL_FROM`          | A real sending address                                              |
| `NEXT_PUBLIC_API_URL` | `https://your-domain/api` — **baked into the client at build time** |

Optional, deploy-only knobs (read by `ecosystem.config.cjs`, not by the app's Zod config):

| Variable         | Default | Effect                                                            |
| ---------------- | ------- | ----------------------------------------------------------------- |
| `API_INSTANCES`  | `1`     | `2`+ puts the API in pm2 cluster mode → **zero-downtime reloads** |
| `DASHBOARD_PORT` | `3000`  | Port `next start` binds                                           |
| `API_PORT`       | `4000`  | Already app config; the health check reads it too                 |

Mixing up the pooled and direct Neon URLs is the classic failure here: the app hits the
connection ceiling, or `prisma migrate deploy` fails against the pooler (CLAUDE.md §3).

### 1.4 Reverse proxy + TLS

pm2 binds the apps to localhost ports; nginx terminates TLS and puts both behind one origin
(which is what keeps the session cookie first-party). `/api` is stripped before the API sees it,
so `NEXT_PUBLIC_API_URL=https://your-domain/api` lines up with the `/v1` routes.

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain;

  # certbot fills in ssl_certificate / ssl_certificate_key

  client_max_body_size 20M;

  location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain
```

Only 22/80/443 need to be open. Ports 3000/4000 stay on loopback.

### 1.5 First deploy, by hand

Prove the server can do it before handing the keys to CI:

```bash
cd /srv/toastmasters-platform
./infra/deploy/deploy.sh                 # install → build → migrate → pm2 → health
RUN_SEED=true ./infra/deploy/deploy.sh   # first time only: seed the reference vocabularies
pnpm --filter @toastmasters/api bootstrap:admin   # create the first system_admin
```

---

## 2. Wiring up GitHub Actions

Actions needs its own SSH key to reach the server (separate from the read-only GitHub deploy
key in §1.2):

```bash
# on your laptop
ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/tm_actions -N ''
ssh-copy-id -i ~/.ssh/tm_actions.pub deploy@your-server
ssh-keyscan -p 22 your-server            # output goes into DEPLOY_SSH_KNOWN_HOSTS
cat ~/.ssh/tm_actions                    # private key → DEPLOY_SSH_KEY
```

Repo ▸ Settings ▸ Secrets and variables ▸ Actions ▸ **New repository secret**:

| Secret                   | Value                                        | Required |
| ------------------------ | -------------------------------------------- | -------- |
| `DEPLOY_SSH_KEY`         | The **private** key from `~/.ssh/tm_actions` | yes      |
| `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan` output for the server          | yes      |
| `DEPLOY_HOST`            | Server hostname or IP                        | yes      |
| `DEPLOY_USER`            | `deploy`                                     | yes      |
| `DEPLOY_PATH`            | `/srv/toastmasters-platform`                 | yes      |
| `DEPLOY_PORT`            | SSH port, if not 22                          | no       |
| `PRODUCTION_ENV_FILE`    | The **entire contents** of production `.env` | yes      |

Host-key checking is **strict** — `DEPLOY_SSH_KNOWN_HOSTS` is not optional, and the workflow
fails fast with a readable error rather than trusting whatever answers on that IP.

`PRODUCTION_ENV_FILE` is pasted as one blob — copy the whole file, not one line at a time:

```bash
# on your laptop, with the production .env open
pbcopy < /path/to/production.env   # or: cat it and paste manually
```

Paste that into the secret's value box. To change any single variable later, edit your local
copy and paste the whole thing again — GitHub secrets have no diff view, so there's no partial
update. This is deliberately the one place production config lives now; don't also hand-maintain
`.env` on the server (see §1.3).

Optional: create a **`production` environment** (Settings ▸ Environments) to add a required
reviewer or restrict which branches can deploy. The workflow already targets it, so protection
rules apply the moment the environment exists.

### Locking down the deploy user

The Actions key can run any command as `deploy`. Two cheap hardening steps:

- Restrict the key in `~/.ssh/authorized_keys` — e.g. `from="140.82.0.0/16,143.55.64.0/20"` for
  GitHub's ranges (they change; check `https://api.github.com/meta`), or run a self-hosted
  runner and drop public SSH entirely.
- Keep `deploy` out of `sudo`. Nothing in `deploy.sh` needs root.

---

## 3. Everyday operations

### Deploying

Merge to `main`. That's it — CI runs, and Deploy picks up the same commit if CI is green.

Manual run: **Actions ▸ Deploy ▸ Run workflow**, with an optional `ref` (SHA, tag or branch) and
a `seed` checkbox (leave it off; see below).

### Rollback

Deploy the previous good commit — same workflow, `ref` = that SHA:

```
Actions ▸ Deploy ▸ Run workflow ▸ ref: <previous-sha>
```

Or on the server:

```bash
cd /srv/toastmasters-platform
git log --oneline -10
git checkout --detach <previous-sha> && ./infra/deploy/deploy.sh
```

**Migrations do not roll back.** `prisma migrate deploy` only rolls forward, so a code rollback
across a schema change lands old code on a new schema. Keep migrations backward-compatible
(add columns nullable, drop them a release later) and that stays safe. Recovering from a bad
migration means a Neon branch/PITR restore plus a forward fix, not a `git revert`.

### Why seeding is off by default

Reference vocabularies (resources, actions, role templates, Pathways paths, DCP goals) are
**editable in production without a deploy** (CLAUDE.md §10.6). A reseed re-upserts the shipped
values and would overwrite those edits, so it only runs when you ask — `seed: true` on a manual
run, or `RUN_SEED=true ./infra/deploy/deploy.sh` on the server. Do ask for it after a release
that adds new seeded vocabulary.

### Logs and status

```bash
pm2 list
pm2 logs tm-api --lines 100        # tm-api · tm-worker · tm-dashboard
pm2 monit
pm2 describe tm-api
```

Logs are Pino JSON in `~/.pm2/logs/`. Pipe through `pnpm exec pino-pretty` to read them, and set
up `pm2 install pm2-logrotate` so they don't eat the disk.

### Restarting without deploying

If `PRODUCTION_ENV_FILE` is wired up, don't hand-edit `.env` on the server — update the secret
and dispatch **Deploy** with the current `ref` instead, so the change actually persists. The
steps below are for a server that isn't on the GitHub-managed `.env` yet, or a quick same-value
restart:

```bash
cd /srv/toastmasters-platform
set -a; source .env; set +a
pm2 reload infra/deploy/ecosystem.config.cjs --update-env && pm2 save
```

A plain `pm2 restart tm-api` keeps the **old** environment. `--update-env` is the whole point.

---

## 4. Troubleshooting

| Symptom                                                         | Cause / fix                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Deploy fails at `Host key verification failed`                  | `DEPLOY_SSH_KNOWN_HOSTS` is stale (server rebuilt / new IP). Re-run `ssh-keyscan` and update the secret.                            |
| `Permission denied (publickey)`                                 | The Actions **public** key isn't in `deploy@server:~/.ssh/authorized_keys`.                                                         |
| `.env is missing`                                               | §1.3 wasn't done, or `DEPLOY_PATH` points at the wrong directory.                                                                   |
| `pnpm: not found` over SSH                                      | Non-interactive SSH gets a minimal PATH. `sudo corepack enable pnpm` installs to `/usr/bin`, which is on it.                        |
| `prisma migrate deploy` hangs or errors on a prepared statement | `DIRECT_URL` is pointing at the Neon **pooler**. Use the unpooled endpoint.                                                         |
| Health check fails after a green build                          | `pm2 logs --lines 60`. Usually a missing/invalid env var — `parseEnv()` fails fast and names it.                                    |
| Dashboard calls `localhost:4000` in the browser                 | `NEXT_PUBLIC_API_URL` was wrong **at build time**. Fix `.env`, redeploy (it's baked into the bundle).                               |
| Brief 404s on JS chunks during a deploy                         | `next build` rewrites `.next` under the running server; the reload right after clears it. A hard refresh fixes a stuck tab.         |
| Build killed with no error                                      | OOM. Add swap and `NODE_OPTIONS=--max-old-space-size=1536` (§1.1).                                                                  |
| CI green but no deploy ran                                      | Deploy only triggers on CI runs for `main`. Check Actions ▸ Deploy for a skipped run, or dispatch it manually.                      |
| An env change you made keeps disappearing                       | You edited `.env` on the server by hand. The next deploy overwrites it from `PRODUCTION_ENV_FILE` — edit the secret, then redeploy. |
| Deploy fails at `Write production .env from secret`             | `PRODUCTION_ENV_FILE` is unset or empty. Add it (§2) — the workflow refuses to run `deploy.sh` against a missing `.env`.            |

---

## 5. Not built yet

Called out honestly rather than implied:

- **No automated database backups.** Neon has PITR on paid plans — confirm the retention window
  matches what a volunteer district can live with. This is the biggest remaining gap.
- **No staging environment.** Migrations meet production on their first run. `pnpm test:int`
  (Testcontainers) is the only pre-prod exercise a migration currently gets.
- **No uptime monitoring or alerting.** `/health` is a liveness probe with nothing watching it —
  point any external monitor at `https://your-domain/api/health`.
- **Deploys are in-place, not atomic.** The build happens in the live tree (see the chunk-404 row
  above). A release-directory + symlink swap would fix it if that becomes annoying.
