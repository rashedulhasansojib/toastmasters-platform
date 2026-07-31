# Containerised blue-green deployment

**Date:** 2026-07-31 · **Owner:** platform · **Status:** implemented on the `deployment` branch; not yet run against the real server

Replaces the in-place pm2 deploy with a CI-built container image and a blue-green
cutover on a single host. The mechanism is ported from the `clickup-sync`
project; the topology is not, because this is a three-app monorepo with a
Neon-pinned database and two HTTP origins behind one domain.

---

## 1. Why

The pm2 path (`infra/deploy/deploy.sh` + `ecosystem.config.cjs`) builds **on the
server, in the live tree**. Four consequences, all documented as known problems
in the runbook it replaces:

| Problem                                                                 | Where it's admitted today     |
| ----------------------------------------------------------------------- | ----------------------------- |
| `next build` OOMs on a small box mid-deploy                             | `docs/deployment.md` §1.1, §4 |
| Brief 404s on JS chunks — `.next` is rewritten under the running server | §4                            |
| Deploys are in-place, not atomic; no warm rollback target               | §5                            |
| Rollback re-runs the whole install/build on the server                  | §3                            |

Building the artifact once in CI and shipping an immutable image addresses all
four: the server never compiles, the old color keeps serving until the new one
is proven healthy, and rollback is a re-tag of an image that already exists.

## 2. Decisions

Recorded per CLAUDE.md §2 (owner + date + choice), because each one closes a
question that a future reader will otherwise reopen.

1. **Postgres stays on Neon; Redis moves into compose.** (owner: product,
   2026-07-31) CLAUDE.md §3 pins Postgres to Neon and that pin is a database
   decision, not a CI/CD one — porting `clickup-sync`'s bundled Postgres would
   silently overturn it and put us on the hook for backups, already the largest
   gap in the runbook. Redis is different: it holds BullMQ queues and the
   permission cache, both rebuildable, so a container with a volume is
   sufficient and removes a managed dependency.
2. **The deploy is gated on CI.** (owner: product, 2026-07-31) This resolves a
   live contradiction: `docs/deployment.md:26` claimed "a red CI never reaches
   the server" while `.github/workflows/deploy.yml:4-6` stated the opposite in
   its own comment. The doc is now the intent — a red build produces no image,
   and an image is the only thing that can be deployed.
3. **The pm2 path is deleted, not kept as a fallback.** (owner: product,
   2026-07-31) Two live deploy mechanisms drift, and it becomes ambiguous which
   one produced what is running.
4. **CI renders the production `.env` from GitHub secrets on every deploy.**
   (owner: product, 2026-07-31) Production config becomes reproducible: a
   rebuilt host needs no manual step. The accepted cost is that a hand-edit on
   the server is overwritten by the next deploy, and a new variable requires
   both a secret and a workflow edit.

## 3. What ports, and what does not

`clickup-sync` is one Node app, one image, one HTTP port, with bundled Postgres
and Redis. This platform is three apps against an external database. The
blue-green _mechanism_ — image tag, warm second color, health gate, atomic
proxy flip — ports directly. The _topology_ is redesigned below.

## 4. Image — one image, four roles

A single multi-stage `Dockerfile` at the repo root.

- **build** — `node:22-bookworm-slim`, corepack-pinned pnpm, manifests copied
  first so `pnpm install --frozen-lockfile` caches until dependencies change,
  then `pnpm build`. Turbo builds `packages/*` before `apps/*`, which includes
  `prisma generate`.

Debian slim rather than the reference project's Alpine: `argon2` and `sharp` are
native and publish glibc prebuilds, so musl would compile them from source —
slow, and contrary to the `allowBuilds` policy in `pnpm-workspace.yaml`, which
assumes prebuilt binaries. `openssl` is installed in the runner so Prisma's
schema engine stops warning that it cannot detect libssl.

- **runner** — keeps the **full `node_modules`** on purpose: `prisma migrate
deploy` and the `tsx` seed are devDependencies, and `prisma.config.ts` is
  loaded by the Prisma CLI. Same reasoning as the reference project.

No build-time `DATABASE_URL` is needed, unlike the reference. `prisma generate`
never connects, and `prisma.config.ts` already tolerates an undefined
`process.env.DIRECT_URL` for commands that don't connect.

`infra/docker-entrypoint.sh` execs on `ROLE`:

| `ROLE`      | Command                                                 |
| ----------- | ------------------------------------------------------- |
| `api`       | `node apps/api/dist/main.js`                            |
| `worker`    | `node apps/worker/dist/main.js`                         |
| `dashboard` | `next start -p ${DASHBOARD_PORT:-3000}` via its own bin |
| `migrate`   | `pnpm db:deploy`                                        |
| `seed`      | `pnpm db:seed` — off by default, opt-in per deploy      |

Deliberately **not** `pnpm start` for any of them: those scripts wrap
`dotenv -e ../../.env`, which does not exist inside a container and would fail.

`ROLE` is **not** added to `packages/config`'s Zod schema. The reference project
puts it there because its single app branches on it at runtime; here no
application code reads it — it only selects a binary. It is documented in
`.env.example` alongside the other deploy-only knobs.

## 5. Runtime topology — one public upstream

```
Internet :443 ──▶ caddy ──(active.conf)──▶ dashboard-{blue|green}:3000
                                                  │  server-side proxy only
                                                  ▼
                                            api-{blue|green}:4000   ← never published
    worker (singleton) ───────────────────────────┤
                                                  ▼
                            Neon Postgres (external) + redis (compose)
```

**The NestJS API is internal-only.** Every browser request already terminates at
a Next.js route handler under `app/api/**`, which proxies server-side via
`authedFetch`. The browser never calls NestJS directly.

This also fixes a latent bug. The nginx config in the runbook being replaced
routed `/api/ → 127.0.0.1:4000`, but `/api/session/login` is a _Next.js_ route
handler — under that config login was proxied to NestJS `/session/login` and
would 404. Giving Caddy a single upstream removes the class of conflict, and
makes `CORS_ORIGINS` moot for browser traffic.

**Colors are paired.** `dashboard-blue` runs with
`API_INTERNAL_URL=http://api-blue:4000`. Because the only public upstream is the
dashboard, flipping the single `reverse_proxy` line in `active.conf` moves the
whole pair at once — there is no window in which a new dashboard talks to an old
API. The reference project's single-line `active.conf` carries over unchanged.

## 6. Environment model

### 6.1 How it works today

One root `.env`, three consumers, three different loading paths:

- **api / worker** — `parseEnv()` from `packages/config` at boot; in dev the
  scripts are wrapped in `dotenv -e ../../.env`.
- **Prisma** — `prisma.config.ts` self-loads via `process.loadEnvFile()`, trying
  `.env` then `../../.env`.
- **dashboard** — none. It does not depend on `@toastmasters/config`, there is no
  `apps/dashboard/.env`, and no dotenv wrapper on `next dev`/`next start`.

In production, `deploy.sh` does `set -a; source ./.env; set +a`, which is why the
runbook requires the file to be valid shell syntax.

### 6.2 Required change: `NEXT_PUBLIC_API_URL` → `API_INTERNAL_URL`

This is mandatory, not cosmetic. **Next.js inlines `NEXT_PUBLIC_*` at build
time.** Keeping the prefix would bake `http://api-blue:4000` into the image, so
the green dashboard would talk to the blue API — blue-green would appear to work
and be silently wrong.

The variable is read only by server-side code (`lib/api.ts`, `lib/session.ts`,
`lib/session-proxy.ts`), so the `NEXT_PUBLIC_` prefix was never correct. Because
nothing sets it today, the hardcoded `'http://localhost:4000'` fallback is what
actually runs in dev — so the rename carries no behavioural risk.

It stays out of the Zod schema: the dashboard doesn't depend on
`@toastmasters/config`, and adding the dependency to validate one string would
buy nothing.

### 6.3 In containers

`.env` is rendered on the host by CI, then consumed twice: by compose for
`${DOMAIN}` / `${IMAGE_TAG}` interpolation, and by every service via `env_file:`.
Per-service `environment:` blocks layer `ROLE`, `API_INTERNAL_URL` and
`NODE_OPTIONS` on top.

Because compose parses the file rather than sourcing it, shell quoting rules no
longer apply — a value written `MAIL_FROM="Name <a@b>"` would arrive with literal
quotes. The rendered file therefore contains no quoting, and this is documented.

**`parseEnv()` becomes a deploy safety net.** The API and worker fail fast on a
missing or too-short `SESSION_JWT_SECRET`, `DATABASE_URL`, `DIRECT_URL` or
`REDIS_URL`. That failure now happens in the _target_ color, so the health gate
catches an incomplete `.env` **before** the flip. Under pm2 the same mistake took
down the live process.

## 7. Deploy orchestration

`infra/deploy/deploy.sh` is rewritten. It runs on the host, invoked over SSH.

1. Pull the image at `IMAGE_TAG`.
2. Bring up `redis` and `caddy`.
3. Run the one-shot `migrate` service (connects via `DIRECT_URL`, the unpooled
   Neon endpoint — mixing this up with the pooled URL is CLAUDE.md §3's named
   failure mode).
4. Read the live color from `active.conf`; the target is the other one.
5. Start `api-TARGET` and `dashboard-TARGET`.
6. **Health-gate both**: `api-TARGET/health` and `dashboard-TARGET/`, probed from
   inside the Caddy container since the app services are not published.
7. Rewrite `active.conf` and `caddy reload` — in-flight requests drain.
8. Recreate the worker in place.
9. Prune images older than 7 days.

Any failure before step 7 exits non-zero with the previous color still serving.

**Worker cutover.** The worker is a singleton and is not blue-green; it is
recreated after the flip, so briefly old worker code runs against the new schema.
The backward-compatible-migration discipline already documented in
`docs/deployment.md` §3 ("add columns nullable, drop them a release later") is
what makes this safe. That constraint is unchanged, not newly introduced —
migrations were already shared across a rolling pm2 reload.

## 8. CI

- **`.github/workflows/quality.yml`** — new, `workflow_call`. Two jobs:
  `build-test` (install, `db:generate`, lint, typecheck, `test:cov`, build) and
  `integration` (`pnpm test:int`). One definition, two callers.
- **`ci.yml`** — calls `quality.yml`; keeps `commitlint` and `gitleaks`.
- **`deploy.yml`** — `target` (resolve ref → SHA → image name) → `quality` →
  `build-and-push` (GHCR, buildx, `type=gha` cache, tagged `latest` and the
  resolved SHA) → `deploy` (scp the compose file / Caddyfile / deploy script,
  seed `active.conf` only if absent, render `.env` atomically, run `deploy.sh`).

The integration job needs **no `services:` block**: the suite starts its own
Postgres and Redis through Testcontainers (`apps/api/test/support/test-db.ts`
and `test-redis.ts`), so it owns container lifecycle and schema state itself.
Because it lives in `quality.yml`, pull requests get the authorisation matrix
too — 39 `*.int-spec.ts` files, the suite CLAUDE.md §7 calls the most valuable
in the project.

`workflow_dispatch` keeps its `ref` and `seed` inputs. Seeding stays off by
default for the reason already documented: reference vocabularies are editable in
production without a deploy (CLAUDE.md §10.6) and a reseed would overwrite those
edits.

**Rollback no longer rebuilds.** Images are tagged by SHA, so redeploying a
previous commit pulls an image that already exists. Migrations still only roll
forward — that caveat is unchanged.

## 9. Files

**Added:** `Dockerfile`, `.dockerignore`, `infra/docker-entrypoint.sh`,
`infra/docker-compose.prod.yml`, `infra/Caddyfile`, `infra/active.conf`,
`.github/workflows/quality.yml`.

**Rewritten:** `infra/deploy/deploy.sh`, `.github/workflows/deploy.yml`,
`.github/workflows/ci.yml`, `docs/deployment.md`, `infra/README.md`,
`.env.example`.

**Changed:** `apps/dashboard/src/lib/{api,session,session-proxy}.ts` — the rename
only.

**Deleted:** `infra/deploy/ecosystem.config.cjs`.

## 10. Secrets

Existing (unchanged): `DEPLOY_SSH_KEY`, `DEPLOY_SSH_KNOWN_HOSTS`, `DEPLOY_HOST`,
`DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_PORT`.

New, because CI now renders `.env`: `DOMAIN`, `DATABASE_URL`, `DIRECT_URL`,
`SESSION_JWT_SECRET`, `APP_URL`, `CORS_ORIGINS`, `EMAIL_FROM`, and the `S3_*`
group. `REDIS_URL` is not a secret — it is the internal `redis://redis:6379`.

## 11. What the first real run found

The stack was exercised end-to-end before merge: the image pushed to a local
registry, `deploy.sh` run unmodified against a local Postgres and MinIO, with
`DOMAIN=localhost` so Caddy issues an internal certificate instead of calling
ACME. Four things only showed up by running it.

1. **`S3_*` are required, not optional.** `packages/config` marks them
   `.optional()` (a stale "Optional until M5" comment), but `S3StorageAdapter` is
   constructed eagerly at DI time and throws unless all four are set. The API
   cannot boot without them. The deploy workflow therefore treats them as
   required secrets. **The schema is still misleading** and should be tightened
   separately — today a missing bucket produces a Nest DI stack trace instead of
   `parseEnv()`'s readable list.
2. **`timeouts` is not a Caddy 2 site directive.** It had been added
   speculatively and crash-looped Caddy. Removed — Caddy's defaults are already
   permissive. `caddy validate` is now the cheap check before any Caddyfile
   change.
3. **A crash-looping proxy silently breaks the health gate**, because the probe
   runs _inside_ the Caddy container. The gate correctly refused to flip, but the
   reported reason was "api failed its health check" when the API was in fact
   healthy. Worth remembering when reading a failed deploy.
4. **Prisma warns about missing libssl** on `bookworm-slim` and guesses
   `openssl-1.1.x`. `openssl` is now installed in the runner stage.

Verified working: migrations applied (49), health gate passes, blue→green and
green→blue flips both alternate correctly, HTTP→HTTPS redirects (308), security
headers present, the dashboard renders, `POST /api/session/login` reaches NestJS
and returns a problem+json 401 from `/v1/auth/login` — and `/health` returns 404
through Caddy, confirming the API is not publicly exposed.

## 12. Out of scope

- **Automated database backups.** Still the largest gap; Neon PITR remains the
  answer. Unchanged by this work, and called out so it isn't mistaken for solved.
- **Staging environment.** Migrations still meet production on their first real
  run; `pnpm test:int` under Testcontainers is still the only rehearsal.
- **Uptime monitoring.** `/health` still has nothing watching it.
- **Object storage.** Continues to use an external S3-compatible bucket; MinIO
  stays a development-only service.
