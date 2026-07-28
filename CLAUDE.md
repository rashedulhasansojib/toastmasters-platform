# CLAUDE.md

Guidance for AI coding agents working in this repository. Read this fully before the first edit.

This is a **greenfield** project: the design is done, no code exists yet. The four design documents are the source of truth — this file is the operational layer on top of them.

| Read this for…                              | Document              |
| ------------------------------------------- | --------------------- |
| _What_ the platform must do and _why_ (stable, quotable requirement IDs, e.g. `FR-AUTHZ-7`) | `prd.md`              |
| _How it's shaped_ — architecture, data model, invariants, delivery plan (§24) | `system-design.md`    |
| The authorisation model — the single gate, delegation, the access inspector | `rbac-design.md`      |
| _In what order_ we build, and the per-slice method | `roadmap.md`          |

When this file and a design document disagree, the design document wins — and tell the human, so one of them gets fixed. One divergence is already known and intended: see §3.

---

## 0. Git identity — non-negotiable

**Never attribute commits to an AI. Not in the author, not in the committer, not in the message, not in the trailers.**

- ❌ Do **not** add `Co-Authored-By: Claude <noreply@anthropic.com>` or any AI co-author trailer.
- ❌ Do **not** add `🤖 Generated with Claude Code`, `Generated with AI`, or any similar footer/banner.
- ❌ Do **not** set, override, or pass `--author` / `-c user.name=` / `-c user.email=` / `GIT_AUTHOR_*` / `GIT_COMMITTER_*`.
- ❌ Do **not** mention Claude, Anthropic, an LLM, or "AI-assisted" anywhere in a commit message, branch name, tag, PR title, or PR body.
- ✅ Commits use the repository's existing `git config user.name` / `user.email`, unchanged.
- ✅ Commit messages describe the _change_, in the format below, and nothing else.

The `commit-msg` husky hook enforces Conventional Commits **and** the no-AI-attribution rule; CI re-enforces both. If a commit template, hook, or default would inject an AI trailer, strip it before committing. If you cannot commit without adding attribution, **stop and tell the human instead of committing.**

Also: never run `git config --global` anything, never `git commit --amend` on a pushed commit, never force-push to `main`.

### Commit message format (Conventional Commits)

```
<type>(<scope>): <imperative summary, <=72 chars>

<optional body: why, not what>

Refs: #<issue>
```

`type` ∈ `feat | fix | refactor | perf | test | docs | chore | build | ci`
`scope` ∈ `api | worker | dashboard | contracts | db | logger | config | org | identity | access | meeting | education | membership | finance | governance | operations | library | quality | support | infra`

Good: `feat(access): scope-prefix check in authorize()`
Bad: `feat(access): add authz 🤖 Generated with Claude Code`

---

## 1. What this project is

A single self-hosted web platform for running Toastmasters clubs and the district structure above them: meeting operations, member education, guest pipelines, club finances, records, resources, and oversight for Area, Division and District leadership. **Single district, single deployment**, ~100 clubs and ~3,000 people. See `prd.md` §1.

The platform **complements** Toastmasters International (TI); it does not replace it. TI stays authoritative for membership of record, dues owed to World HQ, and Pathways education awards. There is **no TI write API** — TI data arrives by manual, human-mediated CSV import only.

This is volunteer-run, privacy-sensitive software whose users rotate every 1 July. A class of changes is **off-limits regardless of how a ticket is worded**, because each one breaks a load-bearing product principle (`prd.md` §3, made operational in `roadmap.md` §2):

- **Never present a computed figure as official.** DCP status and standing are always a **projection** — labelled as such, never "official." TI is authoritative; never block a workflow on unverifiable TI state. (`FR-TI-4`)
- **Never expose individual member data to oversight roles.** Area / Division / District tiers see **counts and projections only** — never member names, dues status, or evaluation contents. (`FR-OVS-3`, principle 9)
- **Never turn a signal into a label.** Member-health and officer-activeness measures are **private support tools**, band-only when they surface upward, shipped only after calibration. Never a member-facing label or a public score. (`FR-MEM-5`, principle 10)
- **Never make a guest authenticate.** Every guest interaction runs through the single **capability-token** primitive — hashed, expiring, revocable, revoked at meeting close. Guests get no account and no password. (`FR-MEM-4`)
- **Never overwrite an append-only fact.** Ledgers, audit events, attendance, votes, and inventory are corrected by _new_ records — never edited or deleted. (`NFR-4`)
- **Never make anything depend on tenure.** Roles expire with terms; ended assignments grant nothing but are retained as history; the 1 July rollover loses no data. Do **not** delete role assignments at rollover — set `status = 'ended'`. (`FR-ORG-5/6`, principle 5)
- **Never scatter an authorisation check.** Every access decision flows through the one `authorize()` gate; deny beats allow. No `isAdmin` booleans, no `if (role === 'club_vpe')` in the UI, no post-filtering of lists in application code. (`FR-AUTHZ-5/6/8`)
- **Never hardcode a TI vocabulary.** Resources, actions, Pathways paths, DCP goals, role templates, and evaluation criteria are **seeded reference data, editable without a deploy** — not a TypeScript union. (`FR-AUTHZ-1`, `FR-EDU-1`)
- **Never write to TI, and never auto-import from it.** Import is manual and human-mediated by design. (§18)
- **Never hand-edit a grant.** Every grant change goes through the audited surface. (`FR-AUTHZ-11`)
- **Never compute a deadline in the viewer's zone.** TI dues deadlines are Mountain Time; club meetings are in the club's zone; store instants in UTC. (`FR-ORG-8`)

If a request conflicts with any of the above, say so and stop. Don't implement it, then flag it in a comment — flag it **before** implementing.

---

## 2. Status, and the decisions that gate code

Phase 0 (`roadmap.md` §3) and M1 (the walking skeleton — `docs/plans/m1-walking-skeleton.md`) are both done: there is a repository, a schema, CI, and a working `authorize()` gate proven at real HTTP routes. Work now continues from that foundation rather than a greenfield checkout.

**Decided since the design docs were written** (reflected below): the database is **PostgreSQL on Neon** — this closes open decision 1 — and the ORM is **Prisma**. See §3. Decision 6 (region tier) is also closed: **the org tree always roots at `region`** — `org_unit_single_region_root` is a hard unique index, not the optional district-root `system-design.md` §5.1 and `prd.md` FR-ORG-2 describe as a general capability. Chosen in Slice 1 of the M1 walking skeleton for this single, always-region-rooted deployment; a future district-only mode would mean dropping that constraint.

**Decided 2026-07-29** (owner: product, ahead of M4 — `prd.md` §13 / `system-design.md` §25):

- **4. Prospect retention window — 180 days.** An unconverted `Prospect`'s PII (`fullName`, `email`, `phone`, `whatsapp`, `photoUrl`, `bio`) is deleted `deleteAfter` 180 days from creation, enforced by a scheduled job — not aspirational. Aligns with TI's own semiannual dues cadence: a guest who hasn't converted within two full dues periods is stale. (`FR-MEM-3`)
- **7. Local dues model — flat semiannual.** One local dues amount per club, billed on the same semiannual cadence as TI dues (matching `DuesRecord.duesPeriod`, e.g. `"2026-OCT"`). No per-club-configurable cadence and no monthly proration in M4 — the simplest schema that matches the period members already expect. (`FR-FIN-3`)
- **8. Installment plans — permitted; Treasurer approves alone.** `InstallmentPlan.approvedBy` is satisfied by any person holding the club's Treasurer role — no co-approval step. The TI portion of a `DuesRecord` is still front-loaded in the plan's schedule so international dues never lapse mid-plan (`system-design.md` §12.3). (`FR-FIN-8`)

**Still open — do not cut a schema, or write code that presumes an answer to, any of these** (`prd.md` §13 / `system-design.md` §25):

2. **Ballot anonymity** — anonymous or attributable. The two cannot coexist; it changes the vote schema. (Governance motion votes are attributable; meeting award ballots are anonymous — different activities, don't collapse them.)
3. **Club-creation authority** — must a portal club map to a chartered TI club with a number?
5. **Audit retention period.**
9. **Minutes default visibility** — officers, members, or public.
10. **Single district or many** — if many, row-level tenancy vs database-per-district (structurally free via the org tree; operationally expensive to retrofit).

If a task seems to require one of these to be settled, it is blocked. Ask; do not guess and build. When a decision is made, record it (owner + date + choice) in the repo so the "why" survives the handover (`roadmap.md` §7).

---

## 3. Stack — pinned

Versions are **pinned in `package.json` when the repo is scaffolded** (Phase 0) and then treated as fixed. Lock the toolchain at init; don't invent version numbers before then.

| Layer                | Choice                                                        |
| -------------------- | ------------------------------------------------------------ |
| Monorepo             | **pnpm** workspaces + **Turborepo**                          |
| API                  | **NestJS** (TypeScript)                                      |
| Frontend             | **Next.js** (App Router, React, PWA)                        |
| ORM                  | **Prisma**                                                   |
| Database             | **PostgreSQL** on **Neon** (serverless)                     |
| Jobs & cache         | **BullMQ** on **Redis**                                      |
| Validation           | **Zod** — schemas live in `packages/contracts`             |
| Logging              | **Pino** (`nestjs-pino`)                                    |
| Object storage       | **MinIO** in dev, S3-compatible in prod — **signed URLs only** |
| Auth                 | **Argon2id** + self-managed sessions (`jose` JWT, httpOnly cookie) |
| PDF                  | Server-side render (invoices, reports, agendas, minutes)     |
| Email                | Provider behind an `EmailPort`; console transport in dev     |
| Git hooks            | **husky** + **lint-staged** + **gitleaks**                  |

> **Known divergence from the design docs.** `system-design.md` §4.2–4.3 frame the system as **one Next.js deployable with thin route handlers**. The chosen stack splits it into a **NestJS API + Next.js dashboard**, so the layout in §4 below supersedes that framing. The design's domain contexts (§4.5) map cleanly onto NestJS modules — see §4 — but the design doc should be updated to match, or the human should confirm the split. Everything else in §4.2–4.5 (the single `authorize()` gate, "queries live in one place", append-only facts, one org tree) carries over unchanged.

**Rules:**

- **Never** upgrade a major version as a side effect of another task. Majors get their own PR.
- **Never** install a pre-release, canary, RC, or `next` tag.
- Do not add a dependency that duplicates the tree: **no Yup/Joi/`class-validator` — we have Zod; no Winston — we have Pino; no Drizzle/TypeORM — we have Prisma.**
- Before adding _any_ new dependency, ask.

**Neon / Prisma specifics** (get these right at init):

- The app connects through the **pooled** connection string; **migrations use a direct (unpooled) connection** via Prisma's `directUrl`. Mixing them up breaks either the connection ceiling or the migration.
- Connect the runtime client through the **pg/Neon driver adapter**, constructed once and exported from `packages/db`. Don't `new PrismaClient()` ad hoc across the codebase.
- Enable the **`ltree`** extension in the first migration (Neon supports it) — the org tree depends on it (§4, `system-design.md` §5.1).

---

## 4. Layout & boundaries

pnpm + Turborepo monorepo. Read `system-design.md` §4.5 for the domain-context rationale; the tree below is how those contexts land in a NestJS + Next.js repo.

```
apps/
  api          NestJS HTTP API — the domain contexts as vertical-slice modules
  worker       NestJS standalone — BullMQ processors (projections, snapshots, 1-July rollover, digests)
  dashboard    Next.js (App Router, React, PWA) — the UI (the design's "/app")
packages/
  contracts    Zod schemas + inferred types — the shared API contract (api <-> dashboard)
  db           Prisma schema, migrations, generated client — the ONLY place queries live
  logger       Pino config + redaction
  config       Zod-validated env
infra/         docker-compose (postgres, redis, minio), Dockerfiles
```

The design's `/domain/<context>` becomes `apps/api/src/modules/<context>/`; its `/platform` concerns become shared packages and cross-cutting modules (`db` → `packages/db` + repositories; `events` → an events module + the worker; `auth` → `common/auth`; `docs` → a PDF module). Contexts (`system-design.md` §4.5): `org · identity · access · meeting · education · membership · finance · governance · operations · library · quality · support`.

### Module shape (apps/api)

Every context is a vertical slice with the same six files. Follow it exactly; do not invent a new arrangement.

```
modules/meeting/
├── meeting.module.ts
├── meeting.controller.ts       HTTP + guards + Zod pipe. No business logic.
├── meeting.service.ts          Business logic + aggregate invariants. No Prisma.
├── meeting.repository.ts       Prisma. No business logic.
├── meeting.service.spec.ts
└── meeting.e2e-spec.ts
```

### Placement rules

| You are adding…                                                | It goes in…                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A request/response shape or any DTO type                       | `packages/contracts/src/<domain>.ts` — **nowhere else**                             |
| A new endpoint                                                 | An existing `apps/api/src/modules/<context>/` — new module only if no context fits  |
| A Prisma query                                                 | The module's `*.repository.ts`. Never a controller, never a service                 |
| A permission check, role, resource or condition                | The `access` module / `common/authz` — extend `authorize()` and the seeded catalogue, never inline it |
| A background / scheduled job                                   | `apps/worker/src/processors/`                                                       |
| A new seeded vocabulary entry (resource, action, path, DCP goal, role template) | Its seed + migration in `packages/db`, **same commit** — it is data, not code       |
| A sensitive field                                              | Its schema **and** the redact list in `packages/logger`, **same commit**            |
| An env var                                                     | `packages/config` (Zod schema) + `.env.example`, **same commit**                    |
| A shared UI component                                          | `apps/dashboard/src/components/`                                                    |
| A schema change                                                | `packages/db/prisma/schema.prisma` + a generated migration, **same commit**         |

### Boundaries (CI-enforced — do not work around them)

- `apps/*` may import `packages/*`. **Never the reverse.**
- `packages/*` do not import each other. The one exception: anything may import `contracts`.
- **`PrismaClient` appears only in `*.repository.ts` (api) and `processors/` (worker).** In a controller or service it fails review.
- **Permission logic lives only in the `access` module / `common/authz`** — never re-implemented in a service or controller, never inlined in the dashboard.
- **`apps/dashboard` never imports `packages/db`** — it talks to the API.

If a change seems to require breaking one of these, you have misunderstood the task. Stop and ask.

### Build model

- Each `packages/*` **compiles to `dist`** and is consumed as built output (`main`/`types` point at `dist`, not `src`). Turbo's `^build` builds packages before apps. Don't wire an app to import a package's `src`, and don't re-add a `paths` mapping to source in `tsconfig.base.json`.

---

## 5. The authorisation model — the heart of the system

This is the trickiest subsystem and the one where a wrong early decision is most expensive. Full spec: `rbac-design.md`. The load-bearing rules:

- **Scoped RBAC with ownership predicates.** A grant is `(role, scopeNode, resource, action, condition, effect)`. Role is bound to a **place** in the org tree; scope **inherits downward**; conditions restrict to the target row.
- **One `authorize()` function.** Default deny — absence of a grant is a refusal. **Deny always beats allow.** In NestJS this is a **global `JwtAuthGuard`** (deny by default; `@Public()` is explicit and code-reviewed) plus a **global `ResourceGuard`**: annotate a user-/unit-scoped route with `@ResourceScope({ source: 'param'|'query', key: 'orgUnitId' })` and the guard calls the single resolver. Coarse tier gating uses `@Roles(...)`. Extend the resolver — never re-implement the check in a controller or service. (`FR-AUTHZ-6`)
- **Scope is a prefix match on the org tree.** Everything a Division Director can see is `WHERE path <@ 'd41.divA'` (`ltree`). One tree, not four sibling tables (`system-design.md` §5.1).
- **Six actions, fixed:** `read | create | update | approve | export | delete`. `approve` is distinct from `update`; `export` is distinct from `read`. Resist adding more.
- **Five conditions, fixed:** `any | own | assigned | party | published`. This is what keeps the resource list short — not full ABAC.
- **The resource catalogue is seeded data** (`resource_catalog`), not a code union. `restricted` resources (`finance.ledger`, `education.evaluation`, `membership.health_signal`, `platform.audit`) are **never wildcarded**, always logged on read, excluded from read-only support grants.
- **List endpoints filter at the query level** by scope and condition. Never fetch rows and discard them — it leaks through pagination counts. (`FR-AUTHZ-8`)
- **Ended assignments grant nothing.** `effectiveGrants` reads `status = 'active'` only.
- **`canDelegate` guards every grant path** — including invitations that carry roles, or invites become a privilege-escalation route.
- **Permissions are never embedded in the JWT.** Revocation is via a `permissionVersion` counter + a server-side cache (Redis); a bump takes effect without re-login.
- **Grants are never hand-edited.** Changes go through the audited surface, with a dry-run diff and a required reason on overrides/direct grants.
- **Ship the access inspector with the engine** (`rbac-design.md` §7.3). "Why can Karim see the ledger?" must be answerable as a decision trace, in the same milestone.

> **Known divergence from the design docs.** `system-design.md` §7.7 gives `system_admin` standing **R (audited bypass)** on the ledger, evaluations, and health signals. This deployment is stricter (`docs/superpowers/specs/2026-07-28-platform-tier-super-admin-design.md`): `system_admin` holds **no** standing grant on any `restricted` resource — it mints a reason-required, expiring `person_grant` first (break-glass), and that read is audited like any other. Built in the M1 walking skeleton's Slice 6.

The anti-patterns in `rbac-design.md` §11 are prohibited. The worked examples in §12 are the canonical behaviour — when in doubt, match them. **Write the 403 / wrong-scope test, not just the 200.**

---

## 6. Conventions

### Validation — Zod only

Every external input (HTTP body, query, params, env, webhook, JSON column) is parsed against a Zod schema **at the boundary**, and types are **inferred** from schemas — never hand-written alongside them. Schemas live in `packages/contracts`; both the API and the dashboard import them.

- Use Zod 4 top-level format helpers (`z.uuid()`, `z.email()`, `z.iso.datetime()`), not the deprecated `z.string().uuid()` chain.
- Controllers use the shared `ZodValidationPipe`. **Scope the pipe to the parameter** — `@Body(new ZodValidationPipe(Schema))` / `@Query(new ZodValidationPipe(Schema))` — never a method-level `@UsePipes`, which also runs the pipe on `@CurrentUser`/`@Param` and validates the wrong object.
- Request **bodies** are parsed strict: an unexpected field is rejected (422). Don't reach for `class-validator` to get it — it is not installed and will not be.

### Logging — Pino only

- `console.log` is banned outside `scripts/`. Use the injected Pino logger (`nestjs-pino`).
- Log objects, not string concatenation: `log.info({ personId, meetingId }, 'meeting closed')`.
- Every request carries a `requestId`; child loggers inherit it. Don't invent a second correlation id.
- **Never log** passwords, tokens, refresh tokens, `authorization` headers, cookies, session values — or the contents of `restricted` resources (ledger amounts, evaluation text, health signals, audit payloads). Redaction is configured in `packages/logger`; add every new sensitive field to the redact list in the same commit.
- Metrics on: authorisation denials, job failures, token redemptions, login failures, PDF generation. A climbing count of **direct grants / per-unit overrides** means the role templates are wrong — watch it (`NFR-11`).

### Database — Prisma / Postgres (Neon)

- **`PrismaClient` only in `*.repository.ts` (api) and `processors/` (worker).** Construct it once through the pg/Neon driver adapter, exported from `packages/db`.
- **Append-only at the database**, not by convention: `REVOKE UPDATE, DELETE` on ledger, audit, attendance, votes, and inventory-movement tables. Correct with new rows. (`NFR-4`)
- **Enforce term/singleton invariants with partial unique indexes** — one active President per club per year: `UNIQUE (…) WHERE status = 'active'`. Don't push these into application code where a race beats them.
- **Gapless invoice numbering** per club per year via a sequence table + row lock, with a gap-detection job. (`FR-FIN-4`)
- **One vote per person per ballot** via a unique constraint, not a check inside a transaction.
- **The org tree uses `ltree`.** Path maintenance is **transactional** — on re-parent, rewrite the node and every descendant in one transaction, emit `OrgUnitReparented`, invalidate permission caches under both old and new paths.
- Schema changes go through `pnpm db:migrate` (`prisma migrate dev`). **Never** `prisma db push` against anything but a local scratch DB. Never hand-edit a committed migration.
- Prefer one query over N+1: `include`/`select`, or a transaction for batched writes.
- **Never `select *` back to the client** — select the fields you need.
- Deletes on user data write an audit row in the same transaction. Person/financial/governance deletion **anonymises** ledger/invoice/minutes/audit rows rather than removing them — integrity outranks erasure. (`NFR-8`)

### API — NestJS

- **Global `JwtAuthGuard` protects every route**; `@Public()` must be explicit and reviewed. Every route passes `authorize()` and adds its `(role × resource × action × scope)` rows to the generated matrix. (`FR-AUTHZ-6`)
- **Resource authorization by annotation, not by hand** — `@ResourceScope({...})` + the global `ResourceGuard`, calling the single resolver in the `access` module (§5).
- **Route handlers are thin** — parse, authorise, call a service, shape the response. No business logic, no Prisma.
- **Guest paths are not RBAC** — capability tokens, checked separately (`common/auth`).
- **List endpoints filter in the query**, by scope and condition.
- **Errors → problem+json** via a global filter. Never leak stack traces, Prisma error text, or internal identifiers. Across a scope boundary, `restricted` resources return 404, not 403, where existence itself is sensitive.
- Routes are **URI-versioned under `/v1`** (set in `main.ts`); health probes are `VERSION_NEUTRAL` at `/health`. Unlike a shipped native client, the PWA deploys with the API, so `/v1` is a convention rather than an unbreakable contract — still, add `/v2` for breaking changes rather than mutating `/v1`.
- The security baseline (helmet, CORS allowlist from `CORS_ORIGINS`, strict-body validation) is global in `main.ts`. Auth is Argon2id + short-lived access JWT + rotating, HMAC-hashed refresh tokens. **Never bcrypt.**

### Frontend — Next.js

- Server Components by default; `'use client'` only where there is real interaction.
- Render UI from **grants**, not role names: `if (can('meeting.role', 'update'))`, never `if (role === 'club_vpe')`.
- Types come from `packages/contracts`. Never hand-write a response interface.
- Meeting-day tools are **phone-first and offline-tolerant**: timing, counting, and attendance survive a venue-wifi drop; writes are idempotent (client-minted keys) and replayed without duplication. (`NFR-3`, `FR-MTG-6`)
- No credential in `NEXT_PUBLIC_*`. The browser never holds a long-lived token — sessions are httpOnly cookies, revocable via `permissionVersion`.

### Time & money

- Every operational record carries `programYearId`. Closing a year makes its records read-only. Dashboards default to the current year with a selector.
- Store instants in UTC. Render club times in the club's zone; compute TI dues deadlines in **Mountain Time**. Never the viewer's local zone.
- Money is **recorded, never processed** — no payment rails, no PCI scope (`N4`). Club standing is **derived by an explicit handler**, not stored as a status flag. (`FR-FIN-3`)

---

## 7. Testing

The layered suite is `system-design.md` §23.6.

- **Unit** — Vitest, no DB. Aggregate invariants, permission evaluation, DCP goal calculation, dues proration, installment sums, rotation ranking.
- **Integration** — Vitest + **Testcontainers** with a **real Postgres + Redis**, transactions included. **Do not mock Prisma** — mocked-ORM tests pass while production breaks.
- **The authorisation matrix** — every `(role × resource × action × scope)`, generated from role templates and asserted against `authorize()`. **The single most valuable suite in the project.** Every authz-affecting slice extends it.
- **Contract** — API responses against the published `packages/contracts` schema.
- **E2E** — Playwright on seeded data: run a full meeting; onboard a district; roll a program year; issue and settle an invoice; draft, approve and publish minutes.
- **Data-consistency jobs (nightly)** — path consistency, inventory reconciliation, invoice-gap detection, orphan detection, singleton-role verification.

Non-negotiables:

- **Write the 403 / wrong-scope test, not just the 200.** Sibling-club isolation, ended-role-grants-nothing, deny-beats-allow, `own`-on-a-list-returns-only-own-rows, `canDelegate`-blocks-escalation (`rbac-design.md` §9). (`NFR-5`)
- Every bug fix ships with a regression test that fails without the fix.
- **TDD:** write the failing test and the negative case first, then implement.
- **Coverage gate: 80% on `apps/api` and `packages/contracts`.**

Run before you claim done:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

…and drive the real behaviour too — run the meeting, curl the endpoint, click the page, roll the year. Not just green tests.

---

## 8. Working style

Every feature is a **vertical slice** built in this loop (`roadmap.md` §2):

1. **Plan** — the slice is specified in its milestone plan (`docs/plans/mN-*.md`).
2. **Schema + seed + migration first** — one commit. Enforce append-only at the DB layer here.
3. **Wire the gate** — anything touching a resource goes through `authorize()` and adds its rows to the matrix.
4. **Test first** — the failing test **and the negative-scope case**.
5. **Implement** — respect the §4 boundaries.
6. **Verify** — green gate **and** the real behaviour.
7. **Commit** — one logical change, Conventional Commits, no AI attribution.
8. **Checkpoint** — report what shipped and what's next; steer before the next slice.

And:

- **Ask before scope creep.** Fix the ticket. Don't reformat the file, don't "improve" adjacent code, don't rename things you weren't asked to rename.
- **Small commits.** One logical change each. If the message needs an "and", split it.
- **No stubs left behind.** No `// TODO: implement`, no `throw new Error('not implemented')` on a path claimed as done. If it isn't finished, say so.
- **No fabricated results.** Don't claim a test passed unless you ran it and saw it pass. Paste the actual output.
- **Read before writing.** Check `packages/contracts` and existing modules before adding a new one — the schema you want probably already exists on paper.
- **Secrets never enter the repo.** No keys, tokens, connection strings, or `.env` files in commits. If you find one committed, stop and tell the human — do not just delete it (it's still in history and needs rotating).
- **When uncertain about a product decision, ask.** Especially the Phase 0 open decisions (§2). Do not guess and build.

---

## 9. Commands

```bash
pnpm install
pnpm dev                    # turbo: api + worker + dashboard
pnpm --filter @toastmasters/api dev
pnpm --filter @toastmasters/dashboard dev

pnpm db:migrate             # prisma migrate dev
pnpm db:generate            # prisma generate
pnpm db:seed                # seed reference vocabularies (resources, actions, paths, DCP goals, role templates) — wired with the first schema slice
pnpm db:studio

pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm format                 # prettier --write

docker compose -f infra/docker-compose.yml up -d   # postgres, redis, minio
```

Git hooks are managed by **husky** (`.husky/`), installed by `pnpm install` (the `prepare` script). Pre-commit runs the AI-identity/`.env` guards, **gitleaks** (secret scan), and **lint-staged**; commit-msg enforces Conventional Commits + no-AI-attribution. CI re-enforces all of it. `brew install gitleaks` for the local scan.

---

## 10. Definition of Done (per slice / pre-commit)

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green — and the behaviour demonstrated end-to-end.
2. The **403 / wrong-scope case is tested**, and the `(role × resource × action × scope)` matrix is updated.
3. For any authz-affecting slice: every new access decision produces a **human-readable reason**, and the **access inspector covers the new resource**.
4. New ledger / audit / attendance / vote / inventory fields are **append-only at the DB layer** (`REVOKE UPDATE, DELETE`), not by convention.
5. **Restricted** resources (ledger, evaluations, health, audit) are excluded from wildcard grants, logged on read, and added to the `packages/logger` redact list.
6. New reference data is **seeded and editable without a deploy** — not a hardcoded list.
7. Migration committed alongside any schema change; new env in `packages/config` + `.env.example`.
8. No secrets, no `.env`, no `console.log` outside `scripts/` — and **gitleaks is clean**.
9. No new dependency added without asking.
10. **Commit message contains no AI attribution, no co-author trailer, no generated-by footer, and the author is the repo's configured git user.**
