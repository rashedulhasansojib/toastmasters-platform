# Toastmasters Platform

Self-hosted platform for running Toastmasters clubs and a district hierarchy.
This repository is the **Phase 0 scaffold** — the toolchain skeleton every later
milestone builds on. The domain schema is intentionally empty; it is cut in M1
(see `roadmap.md` and the open decisions in `CLAUDE.md`).

## Stack

| Concern         | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| Monorepo        | pnpm workspaces + Turborepo                                  |
| API             | NestJS (`apps/api`)                                          |
| Background jobs | NestJS standalone + BullMQ on Redis (`apps/worker`)          |
| Dashboard       | Next.js App Router (`apps/dashboard`)                        |
| ORM             | Prisma 7 via the `pg` driver adapter (`packages/db`)         |
| Database        | PostgreSQL (Neon in prod), `ltree` for scope paths           |
| Validation      | Zod, shared in `packages/contracts`                          |
| Logging         | Pino via `nestjs-pino` (`packages/logger`)                   |
| Config          | Zod-validated env (`packages/config`)                        |
| Auth            | Argon2id passwords + jose-signed httpOnly session tokens     |
| Storage         | S3-compatible signed URLs (MinIO in dev) — port only for now |

## Layout

```
apps/
  api          NestJS HTTP API — auth, the authorization engine, /health
  worker       BullMQ processors (none yet; boots and idles)
  dashboard    Next.js App Router
packages/
  contracts    Zod schemas + inferred types (the wire contract)
  db           Prisma schema, migrations, generated client (driver adapter)
  logger       Pino options + redaction
  config       Zod-validated environment
infra/         docker-compose: postgres, redis, minio
```

## Prerequisites

- Node **>= 22.12** (`.nvmrc` pins 22)
- pnpm **11** (`corepack enable`)
- Docker (for local postgres/redis/minio)

## Quickstart

```bash
corepack enable
pnpm install

cp .env.example .env                                   # then edit secrets
docker compose -f infra/docker-compose.yml up -d       # postgres, redis, minio

pnpm db:generate                                        # generate the Prisma client
pnpm db:deploy                                          # apply migrations (enables ltree)

pnpm dev                                                # api + worker + dashboard
```

- API health: <http://localhost:4000/health>
- Dashboard: <http://localhost:3000>

## Scripts (root)

| Command            | Does                                |
| ------------------ | ----------------------------------- |
| `pnpm dev`         | Run all apps in watch mode          |
| `pnpm build`       | Build every package and app (Turbo) |
| `pnpm lint`        | ESLint across the workspace         |
| `pnpm typecheck`   | `tsc --noEmit` everywhere           |
| `pnpm test`        | Unit tests (Vitest)                 |
| `pnpm test:cov`    | Unit tests with coverage gates      |
| `pnpm test:e2e`    | API e2e (supertest) — needs env set |
| `pnpm e2e`         | Dashboard e2e (Playwright)          |
| `pnpm format`      | Prettier write                      |
| `pnpm db:generate` | Generate the Prisma client          |
| `pnpm db:migrate`  | `prisma migrate dev`                |

## Conventions

- **Boundaries are enforced by ESLint + CI.** Apps import packages, never the
  reverse; packages don't import each other (except `contracts`); `PrismaClient`
  and `pg` may appear only in `*.repository.ts` (api) or worker processors; the
  dashboard never imports the database layer. `bcrypt`, `class-validator`,
  `typeorm`, `winston`, etc. are banned imports.
- **Commits** follow Conventional Commits with a fixed type/scope list
  (`commitlint.config.mjs`), enforced by the `commit-msg` hook.
- **Git identity:** commits are never attributed to an AI assistant. A hook
  (`scripts/check-no-ai-attribution.mjs`) blocks it.
- **Secrets** live in your local `.env` (gitignored). A pre-commit hook plus
  gitleaks keep them out of history.

## Notes on pinned versions

Dependencies are pinned exactly (Phase 0) and treated as fixed. Two deliberate
holds:

- **TypeScript is `6.0.3`, not 7.x.** `typescript-eslint` peer-caps at
  `typescript < 6.1.0`, so TS 7 would break `pnpm lint` (which CI requires to be
  green). Bump when `typescript-eslint` supports TS 7.
- **`@types/node` is `22.x`**, matched to the Node 22 runtime rather than the
  newer 26.x line.

The TS module setup is `module: commonjs` + `moduleResolution: bundler`, which
resolves ESM-only dependencies (e.g. `jose`) while emitting CommonJS for NestJS.
