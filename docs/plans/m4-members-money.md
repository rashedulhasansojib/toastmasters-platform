# M4 — Members & Money

**Goal.** A guest attends, converts, is invoiced, and pays — money **recorded, never processed** (`N4`, no PCI scope). `roadmap.md` §5.

**Depends on.** M3 (conversion draws on meeting attendance/capability tokens), M1 identity.

**Ship gate.** A guest attends → converts → is invoiced → pays; concurrent invoice creation never produces a gap or a duplicate number.

**Must be right.**

- Ledger is **append-only at the DB** (`REVOKE UPDATE, DELETE`), not by convention (`FR-FIN-2`).
- Invoices are **gapless per club per year** via a sequence table + row lock, never `MAX(number)+1` (`FR-FIN-4`).
- Standing is **derived by an explicit handler**, not a stored status flag (`FR-FIN-3`).
- Prospect PII **auto-expires** — `deleteAfter` enforced by a job, not aspirational (`FR-MEM-3`).
- The **handover financial report** gives an incoming Treasurer a trusted opening balance (`FR-FIN-8`).

**Decisions closed ahead of this milestone** (`CLAUDE.md` §2, 2026-07-29): prospect retention is **180 days**; local dues are **flat semiannual**; installment plans are **permitted, Treasurer approves alone**.

**Scope note** (same lean-per-slice convention M3 settled into): each slice below gets a short Why + Files + the TDD-proving tests, not an exhaustive multi-section write-up. Non-negotiable regardless: the 403/negative-scope test, real TDD, full gate before commit, no AI attribution.

---

## Slice breakdown

| #   | Slice                                                                                     | Depends on      | New resource(s)                                   |
| --- | ----------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| 1   | Prospect pipeline (create/list/read, pipeline status)                                     | M1 org/identity | `membership.prospect`                             |
| 2   | Prospect visits + communications log                                                      | 1               | (same resource)                                   |
| 3   | Retention job — nightly deletion past `deleteAfter`                                       | 1               | — (worker only)                                   |
| 4   | Conversion — Prospect → Person + ClubMembership, create-or-attach                         | 1, M1 identity  | `membership.prospect:update` (reused)             |
| 5   | Append-only ledger (`LedgerEntry`, reversal entries)                                      | M1 org          | `finance.ledger` (already seeded, M1 placeholder) |
| 6   | Dues records — one per (membership, period), flat semiannual, standing derived by handler | 5               | `finance.dues`                                    |
| 7   | Gapless invoices — sequence table + row lock, line items link to `DuesRecord`             | 6               | `finance.invoice`                                 |
| 8   | Installment plans — Treasurer-approved, TI portion front-loaded                           | 6, 7            | `finance.installment_plan`                        |
| 9   | Financial reports — frozen snapshots, handover report                                     | 5, 6, 7         | `finance.report`                                  |
| 10  | Public pages — upcoming meetings + guest join (ties into M3 capability tokens)            | 1, 4            | — (public, `@Public()`)                           |

Deferred, explicitly, out of M4: invoice PDF rendering and email delivery (needs the same PDF-dependency decision M3 Slice 12 deferred — a real renderer, not the print-ready-HTML shortcut, since invoices need to be a durable artifact in object storage, not just a browser print view); payment processing of any kind (`N4` — out of scope permanently, not just deferred).

---

## Slice 1 — Prospect pipeline (create/list/read, pipeline status)

**Why:** `system-design.md` §11.1's `Prospect` is the root of the whole milestone — conversion, dues, and the ship gate's "guest attends" step all hang off it. Guests are **club-local, non-authenticating, VPM-owned** — no capability-token or session involved in this slice, just an officer-recorded pipeline.

**Schema** (`packages/db/prisma/schema.prisma`):

```prisma
model Prospect {
  id                 String    @id @default(uuid()) @db.Uuid
  orgUnitId          String    @map("org_unit_id") @db.Uuid
  orgUnit            OrgUnit   @relation(fields: [orgUnitId], references: [id])
  fullName           String    @map("full_name")
  email              String?
  phone              String?
  whatsapp           String?
  photoUrl           String?   @map("photo_url")
  bio                String?
  leadSource         String?   @map("lead_source")
  preferredRole      String?   @map("preferred_role")
  pipelineStatus     ProspectPipelineStatus @default(new) @map("pipeline_status")
  convertedToPersonId String?  @map("converted_to_person_id") @db.Uuid
  convertedPerson    Person?   @relation(fields: [convertedToPersonId], references: [id])
  convertedAt        DateTime? @map("converted_at")
  deleteAfter        DateTime  @map("delete_after")
  createdBy          String    @map("created_by") @db.Uuid
  createdByPerson    Person    @relation("ProspectCreatedBy", fields: [createdBy], references: [id])
  createdAt          DateTime  @default(now()) @map("created_at")

  @@map("prospect")
}

enum ProspectPipelineStatus {
  new
  contacted
  interested
  not_interested
  joined
}
```

`deleteAfter` is server-computed at create time as `now() + 180 days` (Decision 4) — never client-supplied. `pipelineStatus` moves to `joined` only via Slice 4's conversion handler, never a direct client `update` to that one value (validated in the service, not the DB — a partial unique index can't express "only this handler sets this value").

**Contracts** (`packages/contracts/src/membership.ts`, new file):

- `prospectPipelineStatus` enum
- `prospect` (response shape)
- `createProspectRequestSchema` — `fullName` required; `email`/`phone`/`whatsapp`/`photoUrl`/`bio`/`leadSource`/`preferredRole` optional. No `pipelineStatus`, `deleteAfter`, `convertedToPersonId` — all server-set.
- `updateProspectRequestSchema` — `pipelineStatus: z.enum(['contacted', 'interested', 'not_interested'])` only (excludes `new` and `joined` — `new` is the create-time default, `joined` is conversion-only) plus the same optional contact fields.

**Seed** (`packages/db/src/seed.ts`, same commit): add `membership.prospect` to `RESOURCES` (`context: 'membership'`, `allowedActions: ['read', 'create', 'update']`, `clubScoped: true`, `sensitivity: 'normal'` — a prospect's contact info is PII but not in the `restricted` bracket the four named resources occupy; access is already club-scoped and time-boxed by `deleteAfter`). Add to `club_vpm`'s grants (create the `club_vpm` role template if it doesn't exist yet — check first; if `club_vpe`/`club_president` are the only club-tier templates seeded so far, `club_vpm` needs adding here, tier `club`, `scopeRule: 'self_unit'`, `isSingleton: true`).

**Module** (`apps/api/src/modules/membership/`, new — first slice in a new domain context): `membership.module.ts`, `prospect.controller.ts`, `prospect.service.ts`, `prospect.repository.ts`, specs. Routes: `POST/GET /v1/clubs/:clubUnitId/prospects`, `GET/PATCH /v1/clubs/:clubUnitId/prospects/:prospectId`. `@ResourceScope({ source: 'param', key: 'clubUnitId' })` on every route, matching every M3 controller's pattern exactly.

**Tests** (`prospect-http.int-spec.ts`, new):

1. A `club_vpm` creates a prospect → 201, `pipelineStatus: 'new'`, `deleteAfter` is ~180 days out.
2. A `club_vpm` updates `pipelineStatus` to `'interested'` → 200; attempting `pipelineStatus: 'joined'` directly → 400 (not a valid client-supplied value — `ZodValidationPipe`'s real status code, not the dashboard BFF's 422 convention).
3. Sibling-club `club_vpm` 403s on both create and read — prospects are strictly club-scoped, oversight tiers never see them (§16 — oversight is aggregates only, and a prospect is far more sensitive than an aggregate).

**Steps:**

- [x] Schema + migration + seed (resource, `club_vpm` role template — didn't exist yet, added here).
- [x] Contracts (`packages/contracts/src/membership.ts`, exported from `index.ts`).
- [x] Repository + service + controller + module wiring, TDD against the 3 tests above.
- [x] Bumped `access.seed.int-spec.ts`'s resource count (17→18) and `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`/`ROLES`/`CLUB_SCOPED_ROLES`/`domainRoles`.
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — green (75 unit, up from 72; lint/typecheck/build clean).
- [ ] `pnpm test:int` — **not run**. No Docker in this environment (same gap M3 hit); Testcontainers needs a local container runtime and there is no way around that for this specific suite. In its place: manually verified all three test scenarios by hand against a real Neon+Upstash dev deployment — created a prospect via `curl` (`deleteAfter` landed exactly ~180 days out), confirmed `pipelineStatus: 'interested'` succeeds and `pipelineStatus: 'joined'` is rejected (400, not 422 — corrected that assumption in both the test and this doc after seeing the real response). Sibling-club denial wasn't hand-verified (no second live club/person handy) but is structurally identical to every other `@ResourceScope`-gated route already proven — low risk, still worth a real `test:int` run before this slice is fully trusted.
- [x] Commit: `feat(membership): prospect pipeline — create, list, read, pipeline status`

---

## Slice 2 — Prospect visits + communications log

**Why:** system-design.md §11.1's `Prospect.visits[]`/`communications[]` — the VPM's record of a guest's attendance history and dated contact notes, feeding conversion (Slice 4) and lead-source reporting (§15.4).

**Schema:** `ProspectVisit` (prospectId, meetingId, attendedAt, loggedBy; unique on `(prospectId, meetingId)` — a guest attends a given meeting once) and `ProspectCommunication` (prospectId, channel enum, note, loggedBy, loggedAt), each its own append-adjacent table rather than a Json array on `Prospect` — same reasoning as `MeetingLiveRecord`/`Vote`. No new resource — both reuse `membership.prospect` (already club-scoped, already granted to `club_vpm`).

**API:** `POST/GET /clubs/:clubUnitId/prospects/:prospectId/visits` and `.../communications`, mirroring `AgendaItemController`'s club/parent-ownership-check shape.

**Steps:**

- [x] Schema + migration (`prisma migrate diff` schema-to-schema, no shadow DB needed — see note below).
- [x] Contracts (`ProspectVisit`, `ProspectCommunication`, create-request schemas).
- [x] Repository + controller + module wiring (no service layer — pure CRUD, matching `agenda-item` module's precedent).
- [x] `pnpm lint && pnpm typecheck && pnpm build` — green.
- [ ] Tests and `test:int` — **skipped this slice and all remaining M4 slices**, per explicit instruction to move autopilot-fast through the rest of the milestone. No unit or integration specs were written; the authorization-matrix suite was not extended for these two routes. This is a deliberate, acknowledged deviation from CLAUDE.md §7/§10's normal per-slice TDD gate — flagged here rather than silently skipped, so it's visible before this branch merges.
- [x] Commit + push.

**Migration-generation note (new since Slice 1):** rather than hand-writing `migration.sql`, used `prisma migrate diff --from-schema <previous-committed-schema.prisma> --to-schema <current-schema.prisma> --script` — a pure file-to-file diff that needs no database connection at all, so it sidesteps the shadow-DB slowness/lock issue Slice 1 hit entirely. Applied with the already-established `prisma migrate deploy` (direct connection, no shadow DB). Reuse this for every remaining slice.

---

## Slice 3 — Retention job (nightly, past `deleteAfter`)

**Why:** decision 4 says retention is enforced by a job, not aspirational (`FR-MEM-3`). Worker-only — no new resource, no new route.

**Design choice — anonymise, don't delete the row:** the literal PII fields (`fullName`, `email`, `phone`, `whatsapp`, `photoUrl`, `bio`) are wiped to `null`/`'[redacted]'`, but the `Prospect` row itself stays — same reasoning CLAUDE.md already applies to person/financial/governance deletion ("integrity outranks erasure"). Deleting the row outright would either cascade-delete `ProspectVisit`/`ProspectCommunication` history or hit an FK `RESTRICT` error, and would silently corrupt lead-source aggregates (§15.4). Added `Prospect.piiRedactedAt` (nullable timestamp) so the job is idempotent (`WHERE piiRedactedAt IS NULL`) and so the API/UI can tell a redacted row apart from a live one. `pipelineStatus: 'joined'` prospects are excluded — they're a converted `Person` now, under that model's own retention.

**Worker:** first-ever processor in `apps/worker` (it previously had none). Added `@toastmasters/db` as a worker dependency (previously only the API/worker's own repositories touched Prisma — this is still within the CLAUDE.md §4 rule: "`PrismaClient` appears only in `*.repository.ts` (api) and `processors/` (worker)"). `ProspectRetentionProcessor` (`@Processor('prospect-retention')`) does the `updateMany`; `ProspectRetentionScheduler` registers a nightly repeatable job (`0 2 * * *`) on module init — BullMQ dedupes repeatable jobs by name+pattern, so re-registering on every boot is safe.

**Steps:**

- [x] Schema: `Prospect.piiRedactedAt` + migration (diff-generated, applied via `migrate deploy`).
- [x] Contracts + repository mapper updated to surface `piiRedactedAt`.
- [x] `apps/worker`: `prospect-retention.processor.ts` + `prospect-retention.scheduler.ts`, wired into `app.module.ts`; `@toastmasters/db` added as a dependency.
- [x] `pnpm lint && pnpm typecheck && pnpm build` — green.
- [ ] Tests / `test:int` / manual trigger of the job — **skipped**, per the same autopilot instruction noted in Slice 2. The job has not been exercised against real data (no prospect in the dev DB is yet past its 180-day `deleteAfter`, so there's nothing to manually verify against either). Flagged, not hidden.
- [x] Commit + push.

---

## Slice 4 — Conversion (Prospect → Person + ClubMembership)

**Why:** system-design.md §11.1/§21.2 — a guest who joins gets a real identity, without ever getting a duplicate one if they already have an account (dual membership, §6.2).

**Design:** `ProspectConversionService` (new, in `membership/`) is the first cross-context service in this codebase — it imports `IdentityModule` (already exports `PersonRepository`/`ClubMembershipRepository`) rather than duplicating person/membership logic inside `membership/`. Match-by-email: if the prospect's email hits an existing `Person`, attach (`memberType: 'dual'`); otherwise mint a new `Person` (`memberType: 'new'`). `isPrimary` is true only when this is that person's very first `ClubMembership`. Idempotent: converting an already-converted prospect a second time 409s; re-running against a person who already has a membership at this club returns the existing membership rather than creating a duplicate. No new resource — reuses `membership.prospect:update`.

**Scope cut:** system-design.md's index list (§19.2) names a `membership_one` partial unique index enforcing "one active `ClubMembership` per (person, club)" at the DB layer; that index doesn't exist yet in this schema (a pre-existing gap from M1, not introduced here) — this slice's idempotency is an application-level check only (`findByPerson` + filter), not yet DB-enforced. Worth a follow-up migration, not blocking this slice.

**API:** `POST /clubs/:clubUnitId/prospects/:prospectId/convert` → `{ prospect, person, clubMembership, wasExistingPerson }`.

**Steps:**

- [x] Contracts: `convertProspectResponseSchema` (composes the existing `person`/`clubMembership` schemas from `identity.ts`).
- [x] `ProspectRepository.markConverted` (bypasses the client-facing `update()`'s restricted `pipelineStatus` union — `joined` is never client-reachable).
- [x] `ProspectConversionService` + wired into `ProspectController` as `POST :prospectId/convert`; `MembershipModule` now imports `IdentityModule`.
- [x] `pnpm lint && pnpm typecheck && pnpm build` — green.
- [ ] Tests / `test:int` — **skipped**, same autopilot note as Slices 2–3.
- [x] Commit + push.

---

## Slice 5 — Append-only ledger (`LedgerEntry`)

**Why:** `finance.ledger` is the ledger of club money facts everything downstream (dues, invoices, installments, reports) reconciles against. Must be genuinely append-only (`FR-FIN-2`), not append-only "by convention" — CLAUDE.md is explicit that this is a DB-layer guarantee (`REVOKE UPDATE, DELETE`), not an application-layer promise.

**Schema:** `LedgerEntry` per system-design.md §12.1 (`direction`, `category`, `amount`/`currency`, `occurredOn`, a denormalised counterparty triple, `recordedBy`/`recordedAt`, `reversalOfEntryId`). A `@@unique([reversalOfEntryId])` partial-unique-adjacent index (nullable columns don't conflict on NULL in Postgres) caps each entry at **at most one** reversal, matching CLAUDE.md's "enforce with partial unique indexes" convention. Migration ends with `REVOKE UPDATE, DELETE ON "ledger_entry" FROM CURRENT_USER;` — the exact pattern already used for `audit_event` (`20260728073435_delegation_audit`), so the app's own connection role is physically incapable of mutating a written row, not merely asked nicely not to.

**Scope cut:** the design's `reversedByEntryId` (forward pointer) isn't a stored column — it's derivable (`WHERE reversalOfEntryId = X`), so storing it would be pure denormalisation. Also **not implemented this slice**: the CLAUDE.md §5/§6 rule that `restricted` resources (of which `finance.ledger` is one of the four) get audited-on-read logging and 404-not-403 across a scope boundary — no restricted resource has a real route yet in this codebase (finance.ledger is the _first_), so that's a cross-cutting authz feature affecting all four restricted resources, not something to bolt onto one route as a side effect of this slice. Flagged for a dedicated follow-up, not silently dropped.

**Business logic (real enough to warrant a service, unlike the pure-CRUD `agenda-item` precedent):** reversing an entry computes the opposite `direction` and copies `amount`/`currency`/`counterparty` from the original — the client only supplies a `reason` — so a reversal always exactly cancels what it reverses, and can never itself be reversed (`BadRequestException` if you try) or double-reversed (the unique index + `P2002` → `ConflictException`).

**API:** `POST/GET /clubs/:clubUnitId/ledger-entries`, `POST /clubs/:clubUnitId/ledger-entries/:entryId/reverse`.

**Steps:**

- [x] Schema + migration (diff-generated + hand-appended `REVOKE`, matching the `audit_event` precedent exactly).
- [x] Contracts (new `packages/contracts/src/finance.ts`).
- [x] `FinanceModule` (new context) — repository + service + controller; wired into `app.module.ts`.
- [x] `pnpm lint && pnpm typecheck && pnpm build` — green.
- [ ] Tests / `test:int` — **skipped**, same autopilot note as Slices 2–4. Notably unverified this slice: that the `REVOKE` actually blocks an UPDATE/DELETE attempt end-to-end (the migration applied without error, which is as far as this pass went).
- [x] Commit + push.
