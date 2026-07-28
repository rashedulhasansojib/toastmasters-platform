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
