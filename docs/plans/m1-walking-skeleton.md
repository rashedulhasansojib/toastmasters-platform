# M1 Walking Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the authorisation model at a handful of real routes — a President assigns a VPE in their club; a member of another club cannot see it (query-level 403/404) — on the canonical RBAC engine, with the `system_admin` platform role and the region tier in place.

**Architecture:** One `ltree` org tree rooted at `region`; one `authorize()` gate (default-deny, deny-wins, scope = path prefix, five conditions); grants resolved from platform roles ∪ role-template assignments ∪ unit-policy overrides ∪ direct person grants; revocation via `permission_version`; delegation guarded by `canDelegate`; an access inspector shipped with the engine. Backed by Prisma 7 on Postgres, tested against a real Postgres via Testcontainers.

**Tech Stack:** NestJS 11 (api), Prisma 7 + `@prisma/adapter-pg` (packages/db), Postgres + `ltree`, Redis/BullMQ (permission cache), Zod 4 (packages/contracts), Vitest 4 + Testcontainers 12, Argon2id + `jose` (sessions).

> **Scope note.** This is the M1 milestone plan. It is delivered as ordered
> **slices** (§ "Slice roadmap"). Slices 0–9 below are fully detailed and
> execution-ready. Each later slice is expanded to the same bite-sized TDD depth
> just before it is executed, so its code is written against a proven foundation
> rather than guessed. This matches roadmap.md §7 ("plans are living documents;
> each is a checklist of slices").
>
> **Migration-apply correction (learned during Slice 2).** Steps that say
> "apply the migration" in Slices 0–2 use `prisma migrate dev --name <x>`
> (without `--create-only`) for the apply step. That is unsafe from Slice 2
> onward: `OrgUnit.path` is `Unsupported("ltree")`, so Prisma's schema-diff
> engine cannot see the hand-written ltree indexes (§ Slice 1 Step 3) and
> treats them as drift — a second, unreviewed `migrate dev` invocation will
> silently generate and apply a migration that **drops them**. This happened
> once already and was recovered with `migrate reset` (destructive, dev-only,
> required explicit user consent under Prisma's own AI-agent guard). From
> Slice 3 onward, apply with **`prisma migrate deploy`** instead — it replays
> committed migration files verbatim with no diffing, so it cannot generate a
> corrective migration. Sequence: `migrate dev --create-only --name <x>` →
> hand-review the generated SQL (strip any spurious `DROP INDEX` on
> ltree-adjacent objects) → `migrate deploy` to apply.

---

## Global Constraints

Every task's requirements implicitly include these (verbatim from CLAUDE.md and the design docs):

- **Runtime:** Node `>=22.12.0`. Package manager pnpm `11`. Do not add a dependency without asking.
- **`PrismaClient` only in `*.repository.ts` (api) and `processors/` (worker).** Never in a controller or service. Construct it once via the pg adapter, exported from `packages/db` (`getPrisma()` / `createPrismaClient()`).
- **Boundaries (CI-enforced):** `apps/*` may import `packages/*`, never the reverse; `packages/*` import only `contracts`; `apps/dashboard` never imports `packages/db`.
- **Permission logic lives only in `common/authz` / the access module.** No `isAdmin` booleans, no `if (role === …)`, no post-filtering of lists in app code.
- **Validation:** every external input parsed with a Zod schema from `packages/contracts` at the boundary; types inferred, never hand-written. Zod 4 top-level helpers (`z.uuid()`, `z.email()`, `z.iso.datetime()`). Bodies parsed strict.
- **Logging:** Pino only; `console.log` banned outside `scripts/`. Never log restricted-resource contents; add new sensitive fields to `packages/logger` redact list in the same commit.
- **Append-only at the DB:** ledger, audit, attendance, votes, inventory tables get `REVOKE UPDATE, DELETE`. Correct with new rows.
- **Singletons/terms via partial unique indexes**, not app code (e.g. one active President per club per year `WHERE status='active'`; one region root `WHERE type='region'`).
- **Migrations** via `pnpm db:migrate` (`prisma migrate dev`). Never edit a **committed** migration. `--create-only` then edit is allowed for SQL Prisma can't express (ltree GiST index).
- **Restricted resources** (`finance.ledger`, `education.evaluation`, `membership.health_signal`, `platform.audit`): never wildcarded, logged on read, excluded from `support_readonly`. Across a scope boundary they return **404**, not 403.
- **Reference data is seeded, editable without a deploy** — resources, actions, conditions, role templates are rows, not code unions.
- **Testing:** TDD — write the failing test **and the 403/negative-scope case** first. Integration tests use a real Postgres (Testcontainers); **do not mock Prisma**. Coverage gate 80% on `apps/api` and `packages/contracts`.
- **Commits:** Conventional Commits, `type(scope): …`, scope from the fixed enum (`db | config | contracts | logger | api | access | org | identity | meeting | …`). **No AI attribution anywhere** (author, committer, message, trailers). Small commits — one logical change.
- **Break-glass model (this deployment):** `system_admin` has **no standing grant** on restricted resources; it mints a reason-required, expiring `person_grant` (MFA-gated), then reads are audited. Divergence from system-design §7.7, recorded in the spec.

---

## Slice roadmap (the shape of M1)

Ordered; each ends in an independently testable deliverable. Dependencies flow downward.

| #      | Slice                                         | Deliverable                                                                                                                                                       | Ship criteria                                                                                                                                                                                  |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | **Integration test harness**                  | `withTestDb()` — boots a Postgres container, enables `ltree`, applies committed migrations, yields a `PrismaClient`; integration vitest config                    | A trivial integration test runs a `SELECT 'a.b'::ltree <@ 'a'::ltree` and passes against a real container                                                                                      |
| **1**  | **Org tree**                                  | `org_unit` (ltree `path`, region root) + `OrgUnitRepository` (create with transactional path, subtree via `<@`, reparent)                                         | Create region→district→club; `findSubtree('region.r1')` returns descendants; a second region root is rejected by the DB                                                                        |
| **2**  | **Identity**                                  | `person`, `club_membership`, `role_assignment` + repositories; singleton-role + one-primary-membership partial unique indexes                                     | Assign an active `club_president`; a second active one for the same club/year is rejected; ending an assignment flips `status='ended'` and is retained                                         |
| **3**  | **RBAC vocabulary + templates (seed)**        | `resource_catalog` (sensitivity), `role_template`, `role_template_grant`; seed resources/actions/conditions, a starter template set, and the three platform roles | `pnpm db:seed` is idempotent; the four restricted resources carry `sensitivity='restricted'`; `system_admin`/`unit_admin`/`support_readonly` exist                                             |
| **4**  | **Resolution + gate**                         | `effectiveGrants(person)` (platform ∪ templates ∪ overrides ∪ direct) wired into `AuthzService`; `authorize()` with `exactOnly` + conditions                      | Matrix: `club_treasurer` reads own club ledger (allow), sibling club ledger (deny); ended assignment grants nothing; `self_unit` role does not reach a child unit; deny beats allow            |
| **5**  | **permission_version + cache**                | Redis-backed resolved-grant cache keyed `personId:permission_version`; bump on grant change; `v` session claim                                                    | Appoint a role mid-session; the new grant takes effect without re-login; stale `v` triggers rebuild                                                                                            |
| **6**  | **Delegation, overrides, break-glass, audit** | `canDelegate`; `unit_policy_grant` + `person_grant` (reason+expiry); `system_admin` stricter break-glass mint; `audit_event` (append-only)                        | Escalation via invitation blocked; last `unit_admin` cannot be removed; expired direct grant inert; `system_admin` denied a restricted read until it mints break-glass, then allowed + audited |
| **7**  | **Access inspector**                          | `explain()` decision trace + reverse queries; inspector endpoint                                                                                                  | "Why can Karim read the ledger?" returns the trace in §7.3 form; "who can read `finance.ledger` anywhere" enumerates                                                                           |
| **8**  | **Login + session**                           | Argon2id verify, `jose` JWT with `{sub, activeUnitId, programYearId, v}`, httpOnly cookie; unit switch reissues                                                   | Login sets an httpOnly cookie; `JwtAuthGuard` admits it; unit switch changes `activeUnitId` only                                                                                               |
| **9**  | **One meeting route through the gate**        | Minimal `meeting` module (`meeting.meeting`, `meeting.role`); `@ResourceScope` on a real route                                                                    | **M1 ship gate:** President assigns a VPE (200); other-club member gets a **query-level 403/404**, not filtered-after-fetch                                                                    |
| **10** | **Authorisation matrix + doc updates**        | Generated `(role × resource × action × scope)` suite; the design-doc divergence edits                                                                             | Matrix suite green; CLAUDE.md §1 / system-design §4.6/§7.7 / prd FR-ORG-2 / Phase 0 log updated in-commit                                                                                      |

Program year (`program_year`) is introduced in Slice 2 as the minimal record `role_assignment` references; the rollover job is out of scope for M1.

---

## Slice 0 — Integration test harness

**Why first:** every later slice is integration-tested against a real Postgres with `ltree`. This slice proves the container + migration + `ltree` path works, and yields the `withTestDb()` helper the rest of M1 reuses. It also empirically settles the Prisma-`ltree` representation before Slice 1 depends on it.

**Files:**

- Create: `apps/api/test/support/test-db.ts`
- Create: `apps/api/vitest.integration.config.ts`
- Create: `apps/api/test/integration/harness.int-spec.ts`
- Modify: `apps/api/package.json` (add `test:int` script)
- Modify: `turbo.json` (register `test:int` task)

**Interfaces:**

- Produces: `withTestDb(fn: (db: PrismaClient) => Promise<void>): Promise<void>` — starts a Postgres container, enables `ltree`, applies committed migrations from `packages/db`, constructs a `PrismaClient` via `createPrismaClient(containerUrl)`, runs `fn`, then tears down. Also `startTestDb(): Promise<{ url: string; stop: () => Promise<void> }>` for suite-level reuse.

- [ ] **Step 1: Add the `test:int` script**

In `apps/api/package.json`, add to `scripts`:

```json
"test:int": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 2: Register the task in turbo.json**

In `turbo.json` `tasks`, add (mirrors `test:e2e`):

```json
"test:int": {
  "dependsOn": ["^build"],
  "cache": false
}
```

- [ ] **Step 3: Write the integration vitest config**

Create `apps/api/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Integration suite: real Postgres via Testcontainers. Long timeouts cover
// container pull + migrate on first run.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    include: ['test/**/*.int-spec.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false, // one container at a time keeps CI memory predictable
  },
});
```

- [ ] **Step 4: Write the failing harness test**

Create `apps/api/test/integration/harness.int-spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withTestDb } from '../support/test-db';

describe('integration harness', () => {
  it('runs migrations and supports ltree prefix queries', async () => {
    await withTestDb(async (db) => {
      // ltree is enabled and the operator works on a real container.
      const rows = await db.$queryRaw<Array<{ covered: boolean }>>`
        SELECT ('a.b.c'::ltree <@ 'a.b'::ltree) AS covered
      `;
      expect(rows[0]?.covered).toBe(true);

      // The committed init migration ran (ltree extension present).
      const ext = await db.$queryRaw<Array<{ extname: string }>>`
        SELECT extname FROM pg_extension WHERE extname = 'ltree'
      `;
      expect(ext).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter @toastmasters/api test:int`
Expected: FAIL — `Cannot find module '../support/test-db'` (helper not written yet).

- [ ] **Step 6: Implement the harness**

Create `apps/api/test/support/test-db.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createPrismaClient, type PrismaClient } from '@toastmasters/db';

// packages/db directory, resolved relative to this file (apps/api/test/support).
const DB_PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/db');

async function start(): Promise<{ container: StartedTestContainer; url: string }> {
  const container = await new GenericContainer('postgres:16')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const url = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/test?schema=public`;

  // Apply the committed migrations against the fresh container. prisma.config.ts
  // reads DIRECT_URL for migrations; set both so the pooled/direct split is moot here.
  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'inherit',
    shell: process.platform === 'win32', // pnpm.CMD on Windows
  });

  return { container, url };
}

/** Suite-level: start once, reuse across tests, stop in afterAll. */
export async function startTestDb(): Promise<{
  db: PrismaClient;
  url: string;
  stop: () => Promise<void>;
}> {
  const { container, url } = await start();
  const db = createPrismaClient(url);
  return {
    db,
    url,
    stop: async () => {
      await db.$disconnect();
      await container.stop();
    },
  };
}

/** Convenience: start, run fn, always tear down. */
export async function withTestDb(fn: (db: PrismaClient) => Promise<void>): Promise<void> {
  const { db, stop } = await startTestDb();
  try {
    await fn(db);
  } finally {
    await stop();
  }
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm --filter @toastmasters/api test:int`
Expected: PASS (first run pulls `postgres:16` and builds the client; allow time). If `createPrismaClient`/`PrismaClient` are not exported from `@toastmasters/db`, add the `PrismaClient` type export to `packages/db/src/index.ts` and rebuild `packages/db` first (`pnpm --filter @toastmasters/db build`).

- [ ] **Step 8: Commit**

```bash
git add apps/api/test/support/test-db.ts apps/api/vitest.integration.config.ts apps/api/test/integration/harness.int-spec.ts apps/api/package.json turbo.json
git commit -m "test(api): add Testcontainers Postgres integration harness"
```

---

## Slice 1 — Org tree

**Why:** the org tree is the scope backbone — every grant and every row is placed on it, and `authorize()` is a prefix test on its `ltree` path. Rooted at `region` per the spec.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (add `OrgUnit` model + `OrgUnitType` enum)
- Create: `packages/db/prisma/migrations/<ts>_org_unit/migration.sql` (generated, GiST index added via `--create-only`)
- Create: `apps/api/src/modules/org/org.repository.ts`
- Create: `apps/api/test/integration/org.repository.int-spec.ts`
- Create: `packages/contracts/src/org.ts` (OrgUnit DTO + `OrgUnitType`)
- Modify: `packages/contracts/src/index.ts` (export org contracts)

**Interfaces:**

- Consumes: `startTestDb()` from Slice 0.
- Produces:
  - `OrgUnitType = 'international' | 'region' | 'district' | 'division' | 'area' | 'club'` (contracts).
  - `OrgUnitRepository` with:
    - `createRoot(input: { type: 'region'; code: string; name: string; timezone: string }): Promise<OrgUnit>` — `path = code`.
    - `createChild(input: { parentId: string; type: OrgUnitType; code: string; name: string; timezone: string }): Promise<OrgUnit>` — `path = parent.path || '.' || code`, in a transaction.
    - `findByPath(path: string): Promise<OrgUnit | null>`.
    - `findSubtree(path: string): Promise<OrgUnit[]>` — `WHERE path <@ $path::ltree` (self + descendants).
    - `reparent(nodeId: string, newParentId: string): Promise<void>` — rewrites the node and every descendant's path in one transaction.
  - `OrgUnit` shape (contracts): `{ id: string; type: OrgUnitType; parentId: string | null; path: string; depth: number; name: string; code: string; status: string; timezone: string }`.

- [ ] **Step 1: Define the OrgUnit contract**

Create `packages/contracts/src/org.ts`:

```ts
import { z } from 'zod';

export const orgUnitType = z.enum([
  'international',
  'region',
  'district',
  'division',
  'area',
  'club',
]);
export type OrgUnitType = z.infer<typeof orgUnitType>;

export const orgUnit = z.object({
  id: z.uuid(),
  type: orgUnitType,
  parentId: z.uuid().nullable(),
  path: z.string().min(1), // ltree, dotted labels: "r1.d41.divA.a1.c1234"
  depth: z.number().int().nonnegative(),
  name: z.string().min(1),
  code: z.string().min(1),
  status: z.enum(['active', 'low', 'ineligible', 'suspended', 'dissolved']),
  timezone: z.string().min(1),
});
export type OrgUnit = z.infer<typeof orgUnit>;
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from './org';
```

- [ ] **Step 2: Add the Prisma model**

In `packages/db/prisma/schema.prisma`, append:

```prisma
enum OrgUnitType {
  international
  region
  district
  division
  area
  club
}

enum OrgUnitStatus {
  active
  low
  ineligible
  suspended
  dissolved
}

model OrgUnit {
  id        String        @id @default(uuid()) @db.Uuid
  type      OrgUnitType
  parentId  String?       @map("parent_id") @db.Uuid
  parent    OrgUnit?      @relation("OrgUnitChildren", fields: [parentId], references: [id])
  children  OrgUnit[]     @relation("OrgUnitChildren")
  // ltree; Prisma has no native ltree type, so it is Unsupported and handled via raw SQL.
  path      Unsupported("ltree")
  depth     Int
  name      String
  code      String
  status    OrgUnitStatus @default(active)
  timezone  String
  createdAt DateTime      @default(now()) @map("created_at")
  updatedAt DateTime      @updatedAt @map("updated_at")

  @@map("org_unit")
}
```

- [ ] **Step 3: Generate the migration with `--create-only`, then add the ltree index**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --create-only --name org_unit`
Then edit the newly generated (uncommitted) `migration.sql`, appending after the `CREATE TABLE`:

```sql
-- ltree GiST index for prefix (<@) scope queries. Prisma cannot express this on
-- an Unsupported column, so it is added here (migration not yet committed).
CREATE INDEX "org_unit_path_gist" ON "org_unit" USING GIST ("path");

-- Exactly one region root for this deployment (the tree top). A single-DB,
-- row-level, multi-district deployment would relax this to allow sibling roots.
CREATE UNIQUE INDEX "org_unit_single_region_root"
  ON "org_unit" ("type") WHERE "type" = 'region';

-- Path is unique across the tree.
CREATE UNIQUE INDEX "org_unit_path_unique" ON "org_unit" ("path");
```

- [ ] **Step 4: Apply the migration**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --name org_unit`
Expected: applies cleanly; `prisma generate` runs. (Requires a local dev Postgres or a scratch DB via `DIRECT_URL`.)

- [ ] **Step 5: Write the failing repository test**

Create `apps/api/test/integration/org.repository.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';

describe('OrgUnitRepository (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let repo: OrgUnitRepository;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    repo = new OrgUnitRepository(db);
  });
  afterAll(async () => {
    await stop();
  });

  it('builds a region→district→club tree with materialised paths', async () => {
    const region = await repo.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await repo.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await repo.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1234',
      name: 'Club 1234',
      timezone: 'Asia/Dhaka',
    });

    expect(region.path).toBe('r1');
    expect(district.path).toBe('r1.d41');
    expect(club.path).toBe('r1.d41.c1234');
    expect(club.depth).toBe(2);
  });

  it('findSubtree returns self and all descendants (prefix match)', async () => {
    const subtree = await repo.findSubtree('r1.d41');
    const paths = subtree.map((n) => n.path).sort();
    expect(paths).toEqual(['r1.d41', 'r1.d41.c1234']);
  });

  it('rejects a second region root at the database', async () => {
    await expect(
      repo.createRoot({ type: 'region', code: 'r2', name: 'Region 2', timezone: 'UTC' }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @toastmasters/api test:int`
Expected: FAIL — `Cannot find module '../../src/modules/org/org.repository'`.

- [ ] **Step 7: Implement the repository**

Create `apps/api/src/modules/org/org.repository.ts`. Path is an `Unsupported("ltree")` column, so all path reads/writes use parameterised raw SQL (`::ltree` casts); everything is UUID-keyed.

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { OrgUnit, OrgUnitType } from '@toastmasters/contracts';

// Raw rows come back with snake_case columns and ltree path as text.
interface OrgUnitRow {
  id: string;
  type: OrgUnitType;
  parent_id: string | null;
  path: string;
  depth: number;
  name: string;
  code: string;
  status: OrgUnit['status'];
  timezone: string;
}

function toOrgUnit(row: OrgUnitRow): OrgUnit {
  return {
    id: row.id,
    type: row.type,
    parentId: row.parent_id,
    path: row.path,
    depth: row.depth,
    name: row.name,
    code: row.code,
    status: row.status,
    timezone: row.timezone,
  };
}

@Injectable()
export class OrgUnitRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  async createRoot(input: {
    type: 'region';
    code: string;
    name: string;
    timezone: string;
  }): Promise<OrgUnit> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      INSERT INTO org_unit (id, type, parent_id, path, depth, name, code, status, timezone, created_at, updated_at)
      VALUES (gen_random_uuid(), ${input.type}::"OrgUnitType", NULL, ${input.code}::ltree, 0,
              ${input.name}, ${input.code}, 'active'::"OrgUnitStatus", ${input.timezone}, now(), now())
      RETURNING id, type, parent_id, path::text AS path, depth, name, code, status, timezone
    `;
    return toOrgUnit(rows[0]!);
  }

  async createChild(input: {
    parentId: string;
    type: OrgUnitType;
    code: string;
    name: string;
    timezone: string;
  }): Promise<OrgUnit> {
    return this.db.$transaction(async (tx) => {
      const parents = await tx.$queryRaw<Array<{ path: string; depth: number }>>`
        SELECT path::text AS path, depth FROM org_unit WHERE id = ${input.parentId}::uuid
      `;
      const parent = parents[0];
      if (!parent) throw new Error(`Parent org unit ${input.parentId} not found`);

      const rows = await tx.$queryRaw<OrgUnitRow[]>`
        INSERT INTO org_unit (id, type, parent_id, path, depth, name, code, status, timezone, created_at, updated_at)
        VALUES (gen_random_uuid(), ${input.type}::"OrgUnitType", ${input.parentId}::uuid,
                (${parent.path} || '.' || ${input.code})::ltree, ${parent.depth + 1},
                ${input.name}, ${input.code}, 'active'::"OrgUnitStatus", ${input.timezone}, now(), now())
        RETURNING id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      `;
      return toOrgUnit(rows[0]!);
    });
  }

  async findByPath(path: string): Promise<OrgUnit | null> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE path = ${path}::ltree
    `;
    return rows[0] ? toOrgUnit(rows[0]) : null;
  }

  async findSubtree(path: string): Promise<OrgUnit[]> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE path <@ ${path}::ltree
      ORDER BY path
    `;
    return rows.map(toOrgUnit);
  }

  async reparent(nodeId: string, newParentId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const node = (
        await tx.$queryRaw<Array<{ path: string }>>`
          SELECT path::text AS path FROM org_unit WHERE id = ${nodeId}::uuid`
      )[0];
      const parent = (
        await tx.$queryRaw<Array<{ path: string; depth: number }>>`
          SELECT path::text AS path, depth FROM org_unit WHERE id = ${newParentId}::uuid`
      )[0];
      if (!node || !parent) throw new Error('Node or new parent not found');

      const code = node.path.split('.').pop()!;
      const newPath = `${parent.path}.${code}`;

      // Rewrite the node and every descendant's path in one statement.
      await tx.$executeRaw`
        UPDATE org_unit
        SET path = (${newPath}::ltree || subpath(path, nlevel(${node.path}::ltree))),
            parent_id = CASE WHEN id = ${nodeId}::uuid THEN ${newParentId}::uuid ELSE parent_id END,
            depth = nlevel(${newPath}::ltree || subpath(path, nlevel(${node.path}::ltree))) - 1,
            updated_at = now()
        WHERE path <@ ${node.path}::ltree
      `;
    });
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @toastmasters/api test:int`
Expected: PASS (all three org tests).

- [ ] **Step 9: Verify the wider gate is still green**

Run: `pnpm --filter @toastmasters/contracts build && pnpm --filter @toastmasters/api typecheck && pnpm --filter @toastmasters/api lint`
Expected: no errors. (`org.repository.ts` legitimately imports `@toastmasters/db`; the eslint prisma-import ban applies only to `*.controller.ts` / `*.service.ts`.)

- [ ] **Step 10: Commit**

```bash
git add packages/contracts/src/org.ts packages/contracts/src/index.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/modules/org/org.repository.ts apps/api/test/integration/org.repository.int-spec.ts
git commit -m "feat(org): org tree with ltree paths and subtree queries"
```

---

## Slice 2 — Identity

**Why:** `role_assignment` — what Slice 3's RBAC seed attaches roles to, and what Slice 4's `effectiveGrants()` resolves — needs a `person` to reference and a `program_year` to scope by. `system-design.md` §6 keeps three concepts deliberately separate (`Person` = who; `ClubMembership` = which clubs, what standing; `RoleAssignment` = what office, which term) so dual membership, multi-office holders, and a clean 1 July handover all fall out of the shape rather than needing special-case code.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (add `Person`, `ClubMembership`, `RoleAssignment`, `ProgramYear` models + enums; add the two reverse relations on `OrgUnit`)
- Create: `packages/db/prisma/migrations/<ts>_identity/migration.sql` (generated, two partial unique indexes added via `--create-only`)
- Create: `apps/api/src/modules/identity/program-year.repository.ts`
- Create: `apps/api/src/modules/identity/person.repository.ts`
- Create: `apps/api/src/modules/identity/club-membership.repository.ts`
- Create: `apps/api/src/modules/identity/role-assignment.repository.ts`
- Create: `apps/api/test/integration/identity.repository.int-spec.ts`
- Create: `packages/contracts/src/identity.ts` (`Person`, `ClubMembership`, `RoleAssignment`, `ProgramYear` DTOs)
- Modify: `packages/contracts/src/index.ts` (export identity contracts)

**Interfaces:**

- Consumes: `startTestDb()` (Slice 0), `OrgUnitRepository` (Slice 1) — role assignments and club memberships are placed on `OrgUnit` nodes built in these tests via `createRoot`/`createChild`.
- Produces:
  - `ProgramYearRepository`: `create(input: { id: string; startsOn: Date; endsOn: Date }): Promise<ProgramYear>`, `findById(id: string): Promise<ProgramYear | null>`.
  - `PersonRepository`: `create(input: { email: string; fullName: string; phone?: string | null; tiMemberNumber?: string | null }): Promise<Person>`, `findById`, `findByEmail` (both case-insensitive on the lowercased, stored email).
  - `ClubMembershipRepository`: `create(input: { personId: string; clubUnitId: string; memberType: ClubMemberType; isPrimary?: boolean }): Promise<ClubMembership>`, `findByPerson(personId: string): Promise<ClubMembership[]>`.
  - `RoleAssignmentRepository`: `assign(input: { personId, orgUnitId, role: string, programYearId, termStart: Date, termEnd: Date, appointedBy }): Promise<RoleAssignment>` (always creates `status: 'active'` — M1 has no approval workflow), `end(id: string, reason: RoleAssignmentEndedReason): Promise<void>` (flips to `status: 'ended'`, never deletes), `findById`, `findActiveForUnit(orgUnitId: string, role?: string): Promise<RoleAssignment[]>`.
  - Contract shapes (`packages/contracts`): `Person` (no `passwordHash` — it never leaves the repository layer), `ClubMembership`, `RoleAssignment` (`role: string` for now — Slice 3 narrows it to a catalogued `RoleKey` once `role_template` exists), `ProgramYear` (minimal: `id`, `startsOn`, `endsOn`, `status` — the full `duesPeriods`/`trainingPeriods`/`areaVisitRounds` shape from `system-design.md` §5.2 lands with the finance/education/quality slices, not here).

- [ ] **Step 1: Define the identity contracts**

Create `packages/contracts/src/identity.ts`:

```ts
import { z } from 'zod';

export const personStatus = z.enum(['invited', 'active', 'disabled']);
export type PersonStatus = z.infer<typeof personStatus>;

export const person = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string().min(1),
  phone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  tiMemberNumber: z.string().nullable(),
  status: personStatus,
  mfaEnabled: z.boolean(),
  permissionVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});
// `passwordHash` is deliberately absent — it never leaves the repository layer.
export type Person = z.infer<typeof person>;

export const clubMemberType = z.enum([
  'new',
  'renewing',
  'dual',
  'reinstated',
  'charter',
  'transfer',
  'honorary',
]);
export type ClubMemberType = z.infer<typeof clubMemberType>;

export const clubMembershipTiStanding = z.enum(['good', 'lapsed', 'unknown']);
export const clubMembershipLocalStatus = z.enum(['active', 'inactive', 'on_leave', 'suspended']);
export const clubMembershipProvenance = z.enum(['portal', 'ti_import']);

export const clubMembership = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  clubUnitId: z.uuid(),
  memberType: clubMemberType,
  joinedAt: z.iso.datetime(),
  leftAt: z.iso.datetime().nullable(),
  isPrimary: z.boolean(),
  tiStanding: clubMembershipTiStanding,
  localStatus: clubMembershipLocalStatus,
  provenance: clubMembershipProvenance,
  lastReconciledAt: z.iso.datetime().nullable(),
});
export type ClubMembership = z.infer<typeof clubMembership>;

export const roleAssignmentStatus = z.enum(['pending', 'active', 'ended', 'revoked']);
export type RoleAssignmentStatus = z.infer<typeof roleAssignmentStatus>;

export const roleAssignmentEndedReason = z.enum(['term_end', 'resigned', 'removed', 'succeeded']);
export type RoleAssignmentEndedReason = z.infer<typeof roleAssignmentEndedReason>;

export const roleAssignment = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  orgUnitId: z.uuid(),
  // Plain string until Slice 3 seeds role_template and this narrows to a
  // catalogued RoleKey — see rbac-design.md §3 table 2.
  role: z.string().min(1),
  programYearId: z.string().min(1),
  termStart: z.iso.date(),
  termEnd: z.iso.date(),
  status: roleAssignmentStatus,
  appointedBy: z.uuid(),
  appointedAt: z.iso.datetime(),
  trainedAt: z.array(z.object({ period: z.enum(['R1', 'R2']), at: z.iso.datetime() })),
  endedReason: roleAssignmentEndedReason.nullable(),
});
export type RoleAssignment = z.infer<typeof roleAssignment>;

export const programYearStatus = z.enum(['upcoming', 'current', 'closed']);
export type ProgramYearStatus = z.infer<typeof programYearStatus>;

export const programYear = z.object({
  id: z.string().min(1), // e.g. "2026-2027"
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  status: programYearStatus,
});
export type ProgramYear = z.infer<typeof programYear>;
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from './identity';
```

- [ ] **Step 2: Add the Prisma models**

In `packages/db/prisma/schema.prisma`, append:

```prisma
enum PersonStatus {
  invited
  active
  disabled
}

model Person {
  id                String       @id @default(uuid()) @db.Uuid
  email             String       @unique
  passwordHash      String?      @map("password_hash")
  fullName          String       @map("full_name")
  phone             String?
  photoUrl          String?      @map("photo_url")
  bio               String?
  tiMemberNumber    String?      @map("ti_member_number")
  status            PersonStatus @default(invited)
  mfaEnabled        Boolean      @default(false) @map("mfa_enabled")
  permissionVersion Int          @default(1) @map("permission_version")
  createdAt         DateTime     @default(now()) @map("created_at")
  lastLoginAt       DateTime?    @map("last_login_at")

  clubMemberships ClubMembership[]
  roleAssignments RoleAssignment[] @relation("RoleAssignmentPerson")
  appointedRoles  RoleAssignment[] @relation("RoleAssignmentAppointedBy")

  @@map("person")
}

enum ClubMemberType {
  new
  renewing
  dual
  reinstated
  charter
  transfer
  honorary
}

enum ClubMembershipTiStanding {
  good
  lapsed
  unknown
}

enum ClubMembershipLocalStatus {
  active
  inactive
  on_leave
  suspended
}

enum ClubMembershipProvenance {
  portal
  ti_import
}

model ClubMembership {
  id               String                    @id @default(uuid()) @db.Uuid
  personId         String                    @map("person_id") @db.Uuid
  person           Person                    @relation(fields: [personId], references: [id])
  clubUnitId       String                    @map("club_unit_id") @db.Uuid
  clubUnit         OrgUnit                   @relation(fields: [clubUnitId], references: [id])
  memberType       ClubMemberType            @map("member_type")
  joinedAt         DateTime                  @default(now()) @map("joined_at")
  leftAt           DateTime?                 @map("left_at")
  isPrimary        Boolean                   @default(false) @map("is_primary")
  tiStanding       ClubMembershipTiStanding  @default(unknown) @map("ti_standing")
  localStatus      ClubMembershipLocalStatus @default(active) @map("local_status")
  provenance       ClubMembershipProvenance  @default(portal)
  lastReconciledAt DateTime?                 @map("last_reconciled_at")

  @@map("club_membership")
}

enum RoleAssignmentStatus {
  pending
  active
  ended
  revoked
}

enum RoleAssignmentEndedReason {
  term_end
  resigned
  removed
  succeeded
}

model RoleAssignment {
  id                String                     @id @default(uuid()) @db.Uuid
  personId          String                     @map("person_id") @db.Uuid
  person            Person                     @relation("RoleAssignmentPerson", fields: [personId], references: [id])
  orgUnitId         String                     @map("org_unit_id") @db.Uuid
  orgUnit           OrgUnit                    @relation(fields: [orgUnitId], references: [id])
  // Plain text until Slice 3 seeds role_template and adds the FK — rbac-design.md §3.
  role              String
  programYearId     String                     @map("program_year_id")
  programYear       ProgramYear                @relation(fields: [programYearId], references: [id])
  termStart         DateTime                   @map("term_start") @db.Date
  termEnd           DateTime                   @map("term_end") @db.Date
  status            RoleAssignmentStatus       @default(pending)
  appointedBy       String                     @map("appointed_by") @db.Uuid
  appointedByPerson Person                     @relation("RoleAssignmentAppointedBy", fields: [appointedBy], references: [id])
  appointedAt       DateTime                   @default(now()) @map("appointed_at")
  trainedAt         Json                       @default("[]") @map("trained_at")
  endedReason       RoleAssignmentEndedReason? @map("ended_reason")

  @@map("role_assignment")
}

enum ProgramYearStatus {
  upcoming
  current
  closed
}

model ProgramYear {
  id       String            @id // e.g. "2026-2027" — not a UUID
  startsOn DateTime          @map("starts_on") @db.Date
  endsOn   DateTime          @map("ends_on") @db.Date
  status   ProgramYearStatus @default(upcoming)

  roleAssignments RoleAssignment[]

  @@map("program_year")
}
```

And add the two reverse relations to the existing `OrgUnit` model:

```prisma
model OrgUnit {
  // ...existing fields...
  clubMemberships ClubMembership[]
  roleAssignments RoleAssignment[]
}
```

- [ ] **Step 3: Generate the migration with `--create-only`, then add the partial unique indexes**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --create-only --name identity`
Then edit the newly generated (uncommitted) `migration.sql`, appending after the `CREATE TABLE` statements:

```sql
-- One active assignment per (unit, role, year) — rbac-design.md §3. M1 applies
-- this to every role; Slice 3 (role_template.is_singleton) may relax it for
-- roles that are legitimately non-singleton.
CREATE UNIQUE INDEX "role_assignment_singleton"
  ON "role_assignment" ("org_unit_id", "role", "program_year_id")
  WHERE "status" = 'active';

-- One primary (home) club membership per person, while current — a past
-- primary that has since left doesn't block a new one.
CREATE UNIQUE INDEX "club_membership_one_primary"
  ON "club_membership" ("person_id")
  WHERE "is_primary" = true AND "left_at" IS NULL;
```

- [ ] **Step 4: Apply the migration**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --name identity`
Expected: applies cleanly; `prisma generate` runs.

- [ ] **Step 5: Write the failing integration tests**

Create `apps/api/test/integration/identity.repository.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';

describe('Identity repositories (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let orgUnits: OrgUnitRepository;
  let programYears: ProgramYearRepository;
  let people: PersonRepository;
  let clubMemberships: ClubMembershipRepository;
  let roleAssignments: RoleAssignmentRepository;

  let clubId: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    orgUnits = new OrgUnitRepository(db);
    programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    clubMemberships = new ClubMembershipRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1234',
      name: 'Club 1234',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;
  });
  afterAll(async () => {
    await stop();
  });

  describe('PersonRepository', () => {
    it('creates a person with a lowercased, unique email', async () => {
      const created = await people.create({ email: 'Karim@Example.com', fullName: 'Karim Rahman' });
      expect(created.email).toBe('karim@example.com');
      expect(created.status).toBe('invited');

      const found = await people.findByEmail('karim@EXAMPLE.com');
      expect(found?.id).toBe(created.id);
    });

    it('rejects a duplicate email at the database', async () => {
      await people.create({ email: 'dupe@example.com', fullName: 'First' });
      await expect(
        people.create({ email: 'dupe@example.com', fullName: 'Second' }),
      ).rejects.toThrow();
    });
  });

  describe('ClubMembershipRepository', () => {
    it('allows only one primary membership per person', async () => {
      const p = await people.create({ email: 'primary@example.com', fullName: 'Primary Person' });
      const first = await clubMemberships.create({
        personId: p.id,
        clubUnitId: clubId,
        memberType: 'new',
        isPrimary: true,
      });
      expect(first.isPrimary).toBe(true);

      const district = await orgUnits.findByPath('r1.d41');
      const secondClub = await orgUnits.createChild({
        parentId: district!.id,
        type: 'club',
        code: 'c5678',
        name: 'Club 5678',
        timezone: 'Asia/Dhaka',
      });

      await expect(
        clubMemberships.create({
          personId: p.id,
          clubUnitId: secondClub.id,
          memberType: 'dual',
          isPrimary: true,
        }),
      ).rejects.toThrow();
    });
  });

  describe('RoleAssignmentRepository', () => {
    it('assigns an active role and rejects a second active one for the same unit/role/year', async () => {
      const president = await people.create({
        email: 'president@example.com',
        fullName: 'President One',
      });
      const challenger = await people.create({
        email: 'challenger@example.com',
        fullName: 'Challenger Two',
      });

      const assignment = await roleAssignments.assign({
        personId: president.id,
        orgUnitId: clubId,
        role: 'club_president',
        programYearId,
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
        appointedBy: president.id,
      });
      expect(assignment.status).toBe('active');

      await expect(
        roleAssignments.assign({
          personId: challenger.id,
          orgUnitId: clubId,
          role: 'club_president',
          programYearId,
          termStart: new Date('2026-07-01'),
          termEnd: new Date('2027-06-30'),
          appointedBy: president.id,
        }),
      ).rejects.toThrow();
    });

    it('retains an ended assignment with status="ended" rather than deleting it', async () => {
      const p = await people.create({ email: 'vpe@example.com', fullName: 'VPE Person' });
      const assignment = await roleAssignments.assign({
        personId: p.id,
        orgUnitId: clubId,
        role: 'club_vpe',
        programYearId,
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
        appointedBy: p.id,
      });

      await roleAssignments.end(assignment.id, 'resigned');

      const found = await roleAssignments.findById(assignment.id);
      expect(found?.status).toBe('ended');
      expect(found?.endedReason).toBe('resigned');

      const active = await roleAssignments.findActiveForUnit(clubId, 'club_vpe');
      expect(active).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @toastmasters/api test:int`
Expected: FAIL — `Cannot find module '../../src/modules/identity/program-year.repository'` (and siblings).

- [ ] **Step 7: Implement `ProgramYearRepository` and `PersonRepository`**

Create `apps/api/src/modules/identity/program-year.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ProgramYear } from '@toastmasters/contracts';

type ProgramYearRow = Awaited<ReturnType<PrismaClient['programYear']['create']>>;

function toProgramYear(row: ProgramYearRow): ProgramYear {
  return {
    id: row.id,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    status: row.status,
  };
}

@Injectable()
export class ProgramYearRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  async create(input: { id: string; startsOn: Date; endsOn: Date }): Promise<ProgramYear> {
    const row = await this.db.programYear.create({
      data: { id: input.id, startsOn: input.startsOn, endsOn: input.endsOn },
    });
    return toProgramYear(row);
  }

  async findById(id: string): Promise<ProgramYear | null> {
    const row = await this.db.programYear.findUnique({ where: { id } });
    return row ? toProgramYear(row) : null;
  }
}
```

Create `apps/api/src/modules/identity/person.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Person } from '@toastmasters/contracts';

type PersonRow = Awaited<ReturnType<PrismaClient['person']['create']>>;

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    photoUrl: row.photoUrl,
    bio: row.bio,
    tiMemberNumber: row.tiMemberNumber,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    permissionVersion: row.permissionVersion,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PersonRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    email: string;
    fullName: string;
    phone?: string | null;
    tiMemberNumber?: string | null;
  }): Promise<Person> {
    const row = await this.db.person.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        phone: input.phone ?? null,
        tiMemberNumber: input.tiMemberNumber ?? null,
      },
    });
    return toPerson(row);
  }

  async findById(id: string): Promise<Person | null> {
    const row = await this.db.person.findUnique({ where: { id } });
    return row ? toPerson(row) : null;
  }

  async findByEmail(email: string): Promise<Person | null> {
    const row = await this.db.person.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toPerson(row) : null;
  }
}
```

- [ ] **Step 8: Implement `ClubMembershipRepository`**

Create `apps/api/src/modules/identity/club-membership.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ClubMembership, ClubMemberType } from '@toastmasters/contracts';

type ClubMembershipRow = Awaited<ReturnType<PrismaClient['clubMembership']['create']>>;

function toClubMembership(row: ClubMembershipRow): ClubMembership {
  return {
    id: row.id,
    personId: row.personId,
    clubUnitId: row.clubUnitId,
    memberType: row.memberType,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt?.toISOString() ?? null,
    isPrimary: row.isPrimary,
    tiStanding: row.tiStanding,
    localStatus: row.localStatus,
    provenance: row.provenance,
    lastReconciledAt: row.lastReconciledAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ClubMembershipRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    personId: string;
    clubUnitId: string;
    memberType: ClubMemberType;
    isPrimary?: boolean;
  }): Promise<ClubMembership> {
    const row = await this.db.clubMembership.create({
      data: {
        personId: input.personId,
        clubUnitId: input.clubUnitId,
        memberType: input.memberType,
        isPrimary: input.isPrimary ?? false,
      },
    });
    return toClubMembership(row);
  }

  async findByPerson(personId: string): Promise<ClubMembership[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { personId },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toClubMembership);
  }
}
```

- [ ] **Step 9: Implement `RoleAssignmentRepository`**

Create `apps/api/src/modules/identity/role-assignment.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { RoleAssignment, RoleAssignmentEndedReason } from '@toastmasters/contracts';

type RoleAssignmentRow = Awaited<ReturnType<PrismaClient['roleAssignment']['create']>>;

function toRoleAssignment(row: RoleAssignmentRow): RoleAssignment {
  return {
    id: row.id,
    personId: row.personId,
    orgUnitId: row.orgUnitId,
    role: row.role,
    programYearId: row.programYearId,
    termStart: row.termStart.toISOString().slice(0, 10),
    termEnd: row.termEnd.toISOString().slice(0, 10),
    status: row.status,
    appointedBy: row.appointedBy,
    appointedAt: row.appointedAt.toISOString(),
    trainedAt: (row.trainedAt as RoleAssignment['trainedAt']) ?? [],
    endedReason: row.endedReason,
  };
}

@Injectable()
export class RoleAssignmentRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /** Always creates status: 'active' — M1 has no pending-approval workflow. */
  async assign(input: {
    personId: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    termStart: Date;
    termEnd: Date;
    appointedBy: string;
  }): Promise<RoleAssignment> {
    const row = await this.db.roleAssignment.create({
      data: {
        personId: input.personId,
        orgUnitId: input.orgUnitId,
        role: input.role,
        programYearId: input.programYearId,
        termStart: input.termStart,
        termEnd: input.termEnd,
        status: 'active',
        appointedBy: input.appointedBy,
        trainedAt: [],
      },
    });
    return toRoleAssignment(row);
  }

  /** Ended assignments are retained as history, never deleted. */
  async end(id: string, reason: RoleAssignmentEndedReason): Promise<void> {
    await this.db.roleAssignment.update({
      where: { id },
      data: { status: 'ended', endedReason: reason },
    });
  }

  async findById(id: string): Promise<RoleAssignment | null> {
    const row = await this.db.roleAssignment.findUnique({ where: { id } });
    return row ? toRoleAssignment(row) : null;
  }

  async findActiveForUnit(orgUnitId: string, role?: string): Promise<RoleAssignment[]> {
    const rows = await this.db.roleAssignment.findMany({
      where: { orgUnitId, status: 'active', ...(role ? { role } : {}) },
    });
    return rows.map(toRoleAssignment);
  }
}
```

- [ ] **Step 10: Run it to verify it passes**

Run: `pnpm --filter @toastmasters/api test:int`
Expected: PASS (all five identity tests, plus the three existing org tests).

- [ ] **Step 11: Verify the wider gate is still green**

Run: `pnpm --filter @toastmasters/contracts build && pnpm --filter @toastmasters/api typecheck && pnpm --filter @toastmasters/api lint`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add packages/contracts/src/identity.ts packages/contracts/src/index.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/modules/identity apps/api/test/integration/identity.repository.int-spec.ts
git commit -m "feat(identity): person, club membership and role assignment"
```

---

## Slice 3 — RBAC vocabulary + templates (seed)

**Why:** `authorize()` (already built and unit-tested in `common/authz`) evaluates `Grant[]`, but `AuthzService.effectiveGrants()` deliberately returns `[]` today because no vocabulary or templates exist to resolve against. Slice 4 wires real resolution; before it can, the vocabulary itself — what resources/actions/conditions exist, and what each role template grants — has to exist as seeded, editable-without-a-deploy data (`rbac-design.md` §2–§3, §6 table row 1: "Resource catalogue — Engineering — Per release — Migration + seed").

**Scoping decision.** `system-design.md` §7.5–§7.6 specifies the _full_ production permission matrix (~13 domain roles × ~30 resources). Seeding all of it now would be guessing ahead of the code that uses it — CLAUDE.md's placement rule is that a resource's seed lands "in the same commit" as the code that first needs it. This slice seeds only what Slices 2 (already built), 4, and 9 actually exercise: a **starter** set of 7 resources and 4 club-tier role templates, matching the relevant rows of the §7.5 matrix exactly (not invented), plus the three platform-role templates the ship criteria name. More resources/roles arrive incrementally, same-commit-as-first-use, in later slices — this is not the Slice 10 matrix.

**Open question for Slice 9, flagged not resolved here.** The roadmap's Slice 9 one-liner ("President assigns a VPE") could plausibly hit either `meeting.role` (the §7.5 "Meeting role assignment" row — which the matrix actually gives to the **VPE**, not the President) or `identity.role_assignment` (the "Officer roster" row, which the matrix gives to the **President**, matching the ship-gate narrative). This slice seeds both resources with matrix-accurate grants and does not privilege one reading over the other — Slice 9 decides which route it builds.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (add `ResourceCatalog`, `RoleTemplate`, `RoleTemplateGrant` models + `ResourceSensitivity`, `PermissionAction`, `PermissionCondition`, `PermissionEffect`, `RoleTemplateTier`, `RoleTemplateScopeRule` enums)
- Create: `packages/db/prisma/migrations/<ts>_access_vocabulary/migration.sql` (generated via `--create-only`; no ltree-adjacent objects touched, so no hand-edit is expected — review anyway)
- Create: `packages/db/src/seed.ts` (`seedAccessVocabulary(db)` — the idempotent upsert logic, fully typechecked/linted as part of the package's normal `src/`)
- Create: `packages/db/prisma/seed.ts` (thin CLI entrypoint `prisma db seed` invokes; deliberately trivial — see the typecheck-coverage note in Step 5)
- Modify: `packages/db/src/index.ts` (export `seedAccessVocabulary`)
- Modify: `packages/db/prisma.config.ts` (add `migrations.seed`)
- Modify: `packages/db/package.json` (add `"seed": "prisma db seed"`)
- Modify: root `package.json` (add `"db:seed": "pnpm --filter @toastmasters/db seed"`, per the CLAUDE.md §9 command list)
- Create: `apps/api/test/integration/access.seed.int-spec.ts`

**Interfaces:**

- Consumes: `startTestDb()` (Slice 0). No dependency on the Slice 1/2 repositories — this slice touches no `org_unit`/`person` rows, only the vocabulary tables.
- Produces: `seedAccessVocabulary(db: PrismaClient): Promise<void>` (`@toastmasters/db`) — upserts (never inserts blindly), safe to run any number of times. No HTTP endpoint and no `packages/contracts` DTOs yet — there is no route serving this data until Slice 7 (access inspector) or an admin UI; adding Zod contracts now would be modelling a boundary that doesn't exist.
- Seeded resources (`resource_catalog`): `identity.role_assignment`, `meeting.meeting`, `meeting.role` (`sensitivity: normal`); `finance.ledger`, `education.evaluation`, `membership.health_signal`, `platform.audit` (`sensitivity: restricted` — the four named in `rbac-design.md` §2.1 and this slice's own ship criteria).
- Seeded role templates (`role_template` + `role_template_grant`), grants transcribed verbatim from `system-design.md` §7.5:
  - `club_president` (`tier: club`, `scope_rule: self_unit`, singleton): `meeting.meeting:read`, `meeting.role:read`, `finance.ledger:read`, `identity.role_assignment:create`, `identity.role_assignment:update` — all `condition: any`.
  - `club_vpe` (`tier: club`, singleton): `meeting.meeting:update`, `meeting.role:update`, `identity.role_assignment:read` — `any`. No `finance.ledger` grant — the matrix gives VPE `—` on ledger.
  - `club_treasurer` (`tier: club`, singleton): `finance.ledger:read/create/update`, `meeting.meeting:read`, `identity.role_assignment:read` — `any`.
  - `club_member` (`tier: club`, not singleton): `meeting.meeting:read`, `meeting.role:read`, `identity.role_assignment:read` (`any`); `finance.ledger:read` (`condition: own` — matrix: "R (own only)").
  - `system_admin`, `unit_admin`, `support_readonly` (`tier: platform`, `unit_types: []`): templates only, **zero grants** — what a platform role actually grants is Slice 4's resolution algorithm plus Slice 6's break-glass divergence, not seed data guessed at now.

- [ ] **Step 1: Add the Prisma models**

In `packages/db/prisma/schema.prisma`, append:

```prisma
enum ResourceSensitivity {
  normal
  sensitive
  restricted
}

enum PermissionAction {
  read
  create
  update
  delete
  approve
  export
}

enum PermissionCondition {
  any
  own
  assigned
  party
  published
}

enum PermissionEffect {
  allow
  deny
}

model ResourceCatalog {
  resource       String              @id
  context        String
  label          String
  description    String?
  allowedActions PermissionAction[]  @map("allowed_actions")
  clubScoped     Boolean             @default(true) @map("club_scoped")
  sensitivity    ResourceSensitivity @default(normal)

  grants RoleTemplateGrant[]

  @@map("resource_catalog")
}

enum RoleTemplateTier {
  club
  area
  division
  district
  platform
}

enum RoleTemplateScopeRule {
  self_unit
  self_subtree
}

model RoleTemplate {
  role        String                @id
  tier        RoleTemplateTier
  unitTypes   OrgUnitType[]         @map("unit_types")
  scopeRule   RoleTemplateScopeRule @default(self_unit) @map("scope_rule")
  isSingleton Boolean               @default(true) @map("is_singleton")
  isSystem    Boolean               @default(false) @map("is_system")
  label       String

  grants RoleTemplateGrant[]

  @@map("role_template")
}

model RoleTemplateGrant {
  role         String
  roleTemplate RoleTemplate        @relation(fields: [role], references: [role], onDelete: Cascade)
  resource     String
  resourceRef  ResourceCatalog     @relation(fields: [resource], references: [resource])
  action       PermissionAction
  condition    PermissionCondition @default(any)
  effect       PermissionEffect    @default(allow)
  fields       String[]            @default([])

  @@id([role, resource, action, condition])
  @@map("role_template_grant")
}
```

- [ ] **Step 2: Generate the migration, review, apply with `migrate deploy`**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --create-only --name access_vocabulary`
Review the generated SQL — this migration adds new tables/enums only and touches nothing ltree-adjacent, so no `DROP INDEX` should appear. If one does, remove it (see the migration-apply correction note above) before applying.

Then run: `pnpm --filter @toastmasters/db exec prisma migrate deploy`
Expected: applies cleanly; run `pnpm --filter @toastmasters/db exec prisma generate` afterward to regenerate the client.

- [ ] **Step 3: Write the failing integration test**

Create `apps/api/test/integration/access.seed.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';

describe('seedAccessVocabulary (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
  });
  afterAll(async () => {
    await stop();
  });

  it('is idempotent — running it twice produces no duplicates and no errors', async () => {
    await seedAccessVocabulary(db);
    await seedAccessVocabulary(db);

    const resourceCount = await db.resourceCatalog.count();
    expect(resourceCount).toBe(7);
  });

  it('marks exactly the four canonical resources as restricted', async () => {
    const restricted = await db.resourceCatalog.findMany({
      where: { sensitivity: 'restricted' },
      orderBy: { resource: 'asc' },
    });
    expect(restricted.map((r) => r.resource)).toEqual([
      'education.evaluation',
      'finance.ledger',
      'membership.health_signal',
      'platform.audit',
    ]);
  });

  it('seeds the three platform roles', async () => {
    const platformRoles = await db.roleTemplate.findMany({
      where: { tier: 'platform' },
      orderBy: { role: 'asc' },
    });
    expect(platformRoles.map((r) => r.role)).toEqual([
      'support_readonly',
      'system_admin',
      'unit_admin',
    ]);
  });

  it('grants club_treasurer read access to finance.ledger, and gives club_vpe none', async () => {
    const treasurerGrant = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'club_treasurer',
          resource: 'finance.ledger',
          action: 'read',
          condition: 'any',
        },
      },
    });
    expect(treasurerGrant?.effect).toBe('allow');

    const vpeGrants = await db.roleTemplateGrant.findMany({
      where: { role: 'club_vpe', resource: 'finance.ledger' },
    });
    expect(vpeGrants).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @toastmasters/api test:int -- access.seed`
Expected: FAIL — `seedAccessVocabulary` is not exported from `@toastmasters/db`.

- [ ] **Step 5: Implement `seedAccessVocabulary`**

Create `packages/db/src/seed.ts`. This is the only file with real logic — `prisma/seed.ts` (Step 6) is a thin, deliberately trivial wrapper, because it lives outside `src/` (`tsconfig.json`'s `rootDir: "src"` excludes `prisma/`, so nothing there is covered by `pnpm typecheck`) and is executed directly by `tsx`, not compiled.

```ts
import type {
  PermissionAction,
  PermissionCondition,
  PrismaClient,
  ResourceSensitivity,
  RoleTemplateScopeRule,
  RoleTemplateTier,
} from './generated/prisma/client';

interface ResourceSeed {
  resource: string;
  context: string;
  label: string;
  allowedActions: PermissionAction[];
  clubScoped: boolean;
  sensitivity: ResourceSensitivity;
}

interface GrantSeed {
  resource: string;
  action: PermissionAction;
  condition?: PermissionCondition;
}

interface RoleTemplateSeed {
  role: string;
  tier: RoleTemplateTier;
  unitTypes: string[];
  scopeRule: RoleTemplateScopeRule;
  isSingleton: boolean;
  label: string;
  grants: GrantSeed[];
}

const RESOURCES: ResourceSeed[] = [
  {
    resource: 'identity.role_assignment',
    context: 'identity',
    label: 'Officer role assignment',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.meeting',
    context: 'meeting',
    label: 'Meeting',
    allowedActions: ['read', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.role',
    context: 'meeting',
    label: 'Meeting role assignment',
    allowedActions: ['read', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'finance.ledger',
    context: 'finance',
    label: 'Club ledger',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    resource: 'education.evaluation',
    context: 'education',
    label: 'Speech evaluation',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    resource: 'membership.health_signal',
    context: 'membership',
    label: 'Member health signal',
    allowedActions: ['read'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    resource: 'platform.audit',
    context: 'platform',
    label: 'Audit trail',
    allowedActions: ['read'],
    clubScoped: false,
    sensitivity: 'restricted',
  },
];

// Grants transcribed verbatim from system-design.md §7.5 for the resources
// seeded above. Not the full matrix — see the Slice 3 plan's scoping note.
const ROLE_TEMPLATES: RoleTemplateSeed[] = [
  {
    role: 'club_president',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Club President',
    grants: [
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'meeting.role', action: 'read' },
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'identity.role_assignment', action: 'create' },
      { resource: 'identity.role_assignment', action: 'update' },
    ],
  },
  {
    role: 'club_vpe',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Vice President Education',
    grants: [
      { resource: 'meeting.meeting', action: 'update' },
      { resource: 'meeting.role', action: 'update' },
      { resource: 'identity.role_assignment', action: 'read' },
    ],
  },
  {
    role: 'club_treasurer',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Treasurer',
    grants: [
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'finance.ledger', action: 'create' },
      { resource: 'finance.ledger', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
    ],
  },
  {
    role: 'club_member',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: false,
    label: 'Member',
    grants: [
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'meeting.role', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'finance.ledger', action: 'read', condition: 'own' },
    ],
  },
  // Platform roles: tier 'platform', not bound to a unit type. Zero grants —
  // see the Slice 3 plan's note on why these are deferred to Slices 4/6.
  {
    role: 'system_admin',
    tier: 'platform',
    unitTypes: [],
    scopeRule: 'self_subtree',
    isSingleton: false,
    label: 'System Administrator',
    grants: [],
  },
  {
    role: 'unit_admin',
    tier: 'platform',
    unitTypes: [],
    scopeRule: 'self_unit',
    isSingleton: false,
    label: 'Unit Administrator',
    grants: [],
  },
  {
    role: 'support_readonly',
    tier: 'platform',
    unitTypes: [],
    scopeRule: 'self_subtree',
    isSingleton: false,
    label: 'Support (read-only)',
    grants: [],
  },
];

export async function seedAccessVocabulary(db: PrismaClient): Promise<void> {
  for (const r of RESOURCES) {
    await db.resourceCatalog.upsert({
      where: { resource: r.resource },
      create: r,
      update: r,
    });
  }

  for (const t of ROLE_TEMPLATES) {
    await db.roleTemplate.upsert({
      where: { role: t.role },
      create: {
        role: t.role,
        tier: t.tier,
        unitTypes: t.unitTypes as never,
        scopeRule: t.scopeRule,
        isSingleton: t.isSingleton,
        isSystem: true,
        label: t.label,
      },
      update: {
        tier: t.tier,
        unitTypes: t.unitTypes as never,
        scopeRule: t.scopeRule,
        isSingleton: t.isSingleton,
        label: t.label,
      },
    });

    for (const g of t.grants) {
      const condition = g.condition ?? 'any';
      await db.roleTemplateGrant.upsert({
        where: {
          role_resource_action_condition: {
            role: t.role,
            resource: g.resource,
            action: g.action,
            condition,
          },
        },
        create: {
          role: t.role,
          resource: g.resource,
          action: g.action,
          condition,
          effect: 'allow',
        },
        update: { effect: 'allow' },
      });
    }
  }
}
```

Add to `packages/db/src/index.ts`:

```ts
export { seedAccessVocabulary } from './seed';
```

- [ ] **Step 6: Add the thin seed CLI entrypoint and wire it up**

Create `packages/db/prisma/seed.ts`:

```ts
import { createPrismaClient } from '../src/client';
import { seedAccessVocabulary } from '../src/seed';

async function main(): Promise<void> {
  const db = createPrismaClient();
  await seedAccessVocabulary(db);
  await db.$disconnect();
}

void main();
```

In `packages/db/prisma.config.ts`, add a `seed` command to the `migrations` block:

```ts
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // ...unchanged datasource block
});
```

In `packages/db/package.json`, add to `scripts`:

```json
"seed": "prisma db seed",
```

In the root `package.json`, add to `scripts` (next to the other `db:*` entries):

```json
"db:seed": "pnpm --filter @toastmasters/db seed",
```

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm --filter @toastmasters/api test:int -- access.seed`
Expected: PASS (all four tests).

Then confirm the CLI path independently: `pnpm db:seed` against a real dev database, run twice in a row, both times exiting 0.

- [ ] **Step 8: Verify the wider gate is still green**

Run: `pnpm --filter @toastmasters/db build && pnpm --filter @toastmasters/db lint && pnpm --filter @toastmasters/api test:int`
Expected: no errors; all integration tests (harness, org, identity, access) pass.

- [ ] **Step 9: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations packages/db/prisma/seed.ts packages/db/prisma.config.ts packages/db/src/seed.ts packages/db/src/index.ts packages/db/package.json package.json apps/api/test/integration/access.seed.int-spec.ts
git commit -m "feat(access): seed rbac vocabulary and starter role templates"
```

---

## Slice 4 — Resolution + gate

**Why:** `AuthzService.effectiveGrants()` still returns `[]` unconditionally — a deliberate, documented stub since Phase 0. This slice replaces it with `rbac-design.md` §4.2's real resolution algorithm, so `authorize()` (already built, already unit-tested) finally has real data to evaluate.

**Scoping decision.** §4.2 unions four grant sources: platform roles, domain-role templates, unit-policy overrides, direct person grants. The last two have no backing table until Slice 6 (`unit_policy_grant`, `person_grant` are that slice's own deliverable) — so `effectiveGrants` here unions all four _positions_ but only the first two can produce anything; the other two are `[]` by construction, not omitted, so Slice 6 only has to fill in two branches, not restructure the function. Similarly, §4.1's `system_admin` bypass (step 0, "always allowed, always logged") is **not** built here — it requires an `audit_event` table (Slice 6's deliverable) to satisfy the canonical "always logged" half of that behaviour, and this deployment's break-glass divergence (`docs/superpowers/specs/2026-07-28-platform-tier-super-admin-design.md` §6) narrows it further to "no standing grant on restricted resources" — both are Slice 6 work. For now `system_admin` flows through the same `effectiveGrants` → `evaluate()` path as everyone else and — since Slice 3 seeded it zero grants — currently resolves to nothing. That is correct, not a bug: a platform role with no wired bypass and no grants should deny by default, same as anyone else.

**A real gap found while scoping this slice.** `common/authz`'s `Grant`/`scopeCovers` only support prefix-or-equal scope matching — there is no way to express `role_template.scope_rule = 'self_unit'`, which per `rbac-design.md` §4.2 must match the target unit **exactly**, not its descendants ("Without this flag a `self_unit` role silently behaves like `self_subtree` the moment a club gains a child node"). This is this slice's own ship criterion ("self_unit role does not reach a child unit"), so it can't be deferred — `Grant` gets a new `exactOnly` flag and `scopeCovers` gets a third parameter, extending the existing engine rather than working around it (CLAUDE.md §4: "Permission logic lives only in `common/authz`... extend `authorize()`, never inline it").

**Files:**

- Modify: `apps/api/src/common/authz/authz.types.ts` (add `Grant.exactOnly?: boolean`)
- Modify: `apps/api/src/common/authz/evaluate.ts` (`scopeCovers` gains an `exactOnly` parameter; `grantApplies` passes `grant.exactOnly`)
- Modify: `apps/api/src/common/authz/evaluate.spec.ts` (exactOnly cases)
- Modify: `apps/api/src/common/authz/authz.service.ts` (constructor takes `AccessRepository`; `effectiveGrants` delegates to it)
- Modify: `apps/api/src/common/authz/authz.service.spec.ts` (construct with a fake `AccessRepository` — this stays a fast, DB-free unit test)
- Modify: `apps/api/src/common/authz/authz.module.ts` (imports `AccessModule`)
- Create: `apps/api/src/modules/access/access.repository.ts`
- Create: `apps/api/src/modules/access/access.module.ts`
- Modify: `packages/db/prisma/schema.prisma` (add `PlatformRoleAssignment` model + reverse relations on `Person`/`OrgUnit`)
- Create: `packages/db/prisma/migrations/<ts>_platform_role_assignment/migration.sql`
- Create: `apps/api/test/integration/access-resolution.int-spec.ts`

**Interfaces:**

- Consumes: `OrgUnitRepository`, `PersonRepository`, `RoleAssignmentRepository` (Slices 1–2, via their integration-test usage — `AccessRepository` itself queries `role_assignment`/`role_template`/`role_template_grant`/`platform_role_assignment`/`org_unit` directly, since resolving effective grants is inherently a cross-table join, not a single aggregate's concern); `seedAccessVocabulary` (Slice 3).
- Produces:
  - `AccessRepository.effectiveGrants(personId: string): Promise<Grant[]>` — platform-role grants ∪ domain-role-template grants for that person's **active** assignments; unit-policy/direct-grant positions return `[]` until Slice 6.
  - `AuthzService.effectiveGrants()`/`.authorize()`/`.explain()` — same signatures as today, now backed by real data.
  - `Grant.exactOnly?: boolean` — when true, `scopeCovers` requires an exact match; when false/absent, prefix-or-equal (today's behaviour, unchanged for existing callers).

**Ship-criteria mapping** (from the roadmap table): "club_treasurer reads own club ledger (allow), sibling club ledger (deny)" and "ended assignment grants nothing" → new integration test (Step 6). "`self_unit` role does not reach a child unit" → new unit test on `evaluate()` (Step 2) — the precise, synthetic-scope place to prove the mechanism, since real clubs have no child units to construct this against realistically. "Deny beats allow" → **already proved** by the existing `evaluate.spec.ts` test ("lets deny beat allow"); no new grant source produces a `deny` effect until Slice 6 (`unit_policy_grant`), so there is nothing new to wire here.

- [ ] **Step 1: Add `exactOnly` to the `Grant` type**

In `apps/api/src/common/authz/authz.types.ts`, add to the `Grant` interface:

```ts
export interface Grant {
  role: string;
  /** ltree path of the scope node this applies at, e.g. "district.42.area.7.club.318". */
  scope: string;
  /**
   * true for a role_template.scope_rule = 'self_unit' grant: the target scope
   * must equal this grant's scope exactly, not merely fall beneath it.
   * Absent/false = today's prefix-or-equal behaviour (self_subtree).
   */
  exactOnly?: boolean;
  resource: string;
  action: Action;
  condition: Condition;
  effect: Effect;
}
```

- [ ] **Step 2: Write the failing `exactOnly` tests, then extend `scopeCovers`/`evaluate`**

Add to `apps/api/src/common/authz/evaluate.spec.ts`, inside `describe('scopeCovers', ...)`:

```ts
it('an exactOnly grant matches its own scope but not a descendant', () => {
  expect(scopeCovers('district.1.club.10', 'district.1.club.10', true)).toBe(true);
  expect(scopeCovers('district.1.club.10', 'district.1.club.10.sub', true)).toBe(false);
});
```

And inside `describe('evaluate', ...)`:

```ts
it('a self_unit (exactOnly) grant does not reach a child unit', () => {
  const exact = [grant({ exactOnly: true })];
  expect(evaluate(exact, baseRequest).allowed).toBe(true);
  const childRequest = { ...baseRequest, scope: 'district.1.club.10.sub' };
  expect(evaluate(exact, childRequest).allowed).toBe(false);
});
```

Run: `pnpm --filter @toastmasters/api test` — expect FAIL (`scopeCovers` doesn't accept a third argument yet; TS would in fact reject the call, so this fails at typecheck/transform, not just assertion).

Now update `apps/api/src/common/authz/evaluate.ts`:

```ts
export function scopeCovers(grantScope: string, targetScope: string, exactOnly = false): boolean {
  if (grantScope === targetScope) return true;
  if (exactOnly) return false;
  return targetScope.startsWith(`${grantScope}.`);
}
```

```ts
function grantApplies(grant: Grant, request: AccessRequest): boolean {
  return (
    grant.resource === request.resource &&
    grant.action === request.action &&
    scopeCovers(grant.scope, request.scope, grant.exactOnly) &&
    conditionHolds(grant.condition, request)
  );
}
```

Run: `pnpm --filter @toastmasters/api test` — expect PASS, all `evaluate`/`scopeCovers` tests including the two new ones.

- [ ] **Step 3: Add the `PlatformRoleAssignment` model**

In `packages/db/prisma/schema.prisma`, append:

```prisma
model PlatformRoleAssignment {
  // A synthetic id, not the composite (person_id, role, org_unit_id) primary
  // key rbac-design.md §3 table 6 shows — Postgres cannot put a nullable
  // column (org_unit_id is NULL for global roles) inside a PRIMARY KEY. The
  // @@unique below carries the intended uniqueness instead; Postgres treats
  // multiple NULL org_unit_id rows as non-conflicting, which is acceptable
  // here since this slice inserts no rows into this table at all.
  id              String    @id @default(uuid()) @db.Uuid
  personId        String    @map("person_id") @db.Uuid
  person          Person    @relation("PlatformRoleAssignmentPerson", fields: [personId], references: [id])
  role            String
  orgUnitId       String?   @map("org_unit_id") @db.Uuid
  orgUnit         OrgUnit?  @relation(fields: [orgUnitId], references: [id])
  grantedBy       String    @map("granted_by") @db.Uuid
  grantedByPerson Person    @relation("PlatformRoleAssignmentGrantedBy", fields: [grantedBy], references: [id])
  grantedAt       DateTime  @default(now()) @map("granted_at")
  expiresAt       DateTime? @map("expires_at")

  @@unique([personId, role, orgUnitId])
  @@map("platform_role_assignment")
}
```

Add the two reverse relations to `Person`:

```prisma
model Person {
  // ...existing fields...
  platformRoleAssignments PlatformRoleAssignment[] @relation("PlatformRoleAssignmentPerson")
  grantedPlatformRoles    PlatformRoleAssignment[] @relation("PlatformRoleAssignmentGrantedBy")
}
```

And one reverse relation to `OrgUnit`:

```prisma
model OrgUnit {
  // ...existing fields...
  platformRoleAssignments PlatformRoleAssignment[]
}
```

- [ ] **Step 4: Generate the migration, review, apply with `migrate deploy`**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --create-only --name platform_role_assignment`
Review the generated SQL — strip any `DROP INDEX` on `org_unit_path_gist`/`org_unit_path_unique` (the same false-positive drift seen in Slices 2 and 3).

Then: `pnpm --filter @toastmasters/db exec prisma migrate deploy && pnpm --filter @toastmasters/db exec prisma generate`

- [ ] **Step 5: Implement `AccessRepository`**

Create `apps/api/src/modules/access/access.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Grant } from '../../common/authz/authz.types';

interface PathRow {
  path: string;
}

@Injectable()
export class AccessRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * rbac-design.md §4.2: platform ∪ domain-role-template grants. Unit-policy
   * overrides and direct person grants are Slice 6 — no table exists yet, so
   * those two positions are simply absent from the union.
   */
  async effectiveGrants(personId: string): Promise<Grant[]> {
    const [platformGrants, domainGrants] = await Promise.all([
      this.platformRoleGrants(personId),
      this.domainRoleGrants(personId),
    ]);
    return [...platformGrants, ...domainGrants];
  }

  private async platformRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.platformRoleAssignment.findMany({
      where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    const out: Grant[] = [];
    for (const pa of assignments) {
      const scope = pa.orgUnitId ? await this.pathOf(pa.orgUnitId) : await this.regionRootPath();
      out.push(...(await this.grantsForRoleAtScope(pa.role, scope)));
    }
    return out;
  }

  private async domainRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.roleAssignment.findMany({
      where: { personId, status: 'active' },
    });
    const out: Grant[] = [];
    for (const ra of assignments) {
      const scope = await this.pathOf(ra.orgUnitId);
      out.push(...(await this.grantsForRoleAtScope(ra.role, scope)));
    }
    return out;
  }

  /** Shared by both grant sources: look up the template once, stamp every grant with its scope + exactOnly. */
  private async grantsForRoleAtScope(role: string, scope: string): Promise<Grant[]> {
    const template = await this.db.roleTemplate.findUnique({ where: { role } });
    if (!template) return []; // role not in the catalogue — nothing to grant
    const exactOnly = template.scopeRule === 'self_unit';
    const rows = await this.db.roleTemplateGrant.findMany({ where: { role } });
    return rows.map((g) => ({
      role,
      scope,
      exactOnly,
      resource: g.resource,
      action: g.action,
      condition: g.condition,
      effect: g.effect,
    }));
  }

  private async pathOf(orgUnitId: string): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE id = ${orgUnitId}::uuid
    `;
    if (!rows[0]) throw new Error(`Org unit ${orgUnitId} not found`);
    return rows[0].path;
  }

  /** A platform_role_assignment with org_unit_id = NULL means global reach — the region root's own path, so ordinary prefix matching covers the whole tree with no special-casing in evaluate(). */
  private async regionRootPath(): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE type = 'region' LIMIT 1
    `;
    if (!rows[0]) throw new Error('No region root org unit exists');
    return rows[0].path;
  }
}
```

Create `apps/api/src/modules/access/access.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AccessRepository } from './access.repository';

@Module({
  providers: [AccessRepository],
  exports: [AccessRepository],
})
export class AccessModule {}
```

- [ ] **Step 6: Write the failing integration test**

Create `apps/api/test/integration/access-resolution.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('Access resolution (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;

  let clubAPath: string;
  let clubBPath: string;
  let clubAId: string;
  let clubCId: string;
  let clubCPath: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);
    authz = new AuthzService(new AccessRepository(db));

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const clubA = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cA',
      name: 'Club A',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cB',
      name: 'Club B',
      timezone: 'Asia/Dhaka',
    });
    const clubC = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cC',
      name: 'Club C',
      timezone: 'Asia/Dhaka',
    });
    clubAId = clubA.id;
    clubAPath = clubA.path;
    clubBPath = clubB.path;
    clubCId = clubC.id;
    clubCPath = clubC.path;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;
  });
  afterAll(async () => {
    await stop();
  });

  it('club_treasurer reads their own club ledger but not a sibling club ledger', async () => {
    const treasurer = await people.create({
      email: 'treasurer@example.com',
      fullName: 'Treasurer One',
    });
    await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: clubAId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });
    const principal = { userId: treasurer.id, roles: [], scopes: [] };

    const ownClub = await authz.authorize({
      principal,
      resource: 'finance.ledger',
      action: 'read',
      scope: clubAPath,
    });
    expect(ownClub.allowed).toBe(true);

    const siblingClub = await authz.authorize({
      principal,
      resource: 'finance.ledger',
      action: 'read',
      scope: clubBPath,
    });
    expect(siblingClub.allowed).toBe(false);
  });

  it('an ended assignment grants nothing', async () => {
    // A distinct club (clubC), not clubA — reusing clubA here collides with
    // the previous test's still-active club_treasurer@clubA assignment
    // against Slice 2's role_assignment_singleton index (found by actually
    // running this test).
    const treasurer = await people.create({
      email: 'ended-treasurer@example.com',
      fullName: 'Ended Treasurer',
    });
    const assignment = await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: clubCId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });
    await roleAssignments.end(assignment.id, 'resigned');

    const decision = await authz.authorize({
      principal: { userId: treasurer.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read',
      scope: clubCPath,
    });
    expect(decision).toEqual({ allowed: false, reason: 'default-deny' });
  });
});
```

Run: `pnpm --filter @toastmasters/api test:int -- access-resolution` — expect FAIL (`AuthzService` doesn't accept a constructor argument yet).

- [ ] **Step 7: Wire `AuthzService` to `AccessRepository`**

Modify `apps/api/src/common/authz/authz.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { AccessDecision, AccessRequest, Grant } from './authz.types';
import { evaluate } from './evaluate';
import { AccessRepository } from '../../modules/access/access.repository';

@Injectable()
export class AuthzService {
  constructor(private readonly accessRepository: AccessRepository) {}

  /** Resolve the grants that apply to a request (rbac-design.md §4.2). */
  async effectiveGrants(request: AccessRequest): Promise<Grant[]> {
    return this.accessRepository.effectiveGrants(request.principal.userId);
  }

  /** The one authorization gate. Everything funnels through here (default-deny). */
  async authorize(request: AccessRequest): Promise<AccessDecision> {
    const grants = await this.effectiveGrants(request);
    return evaluate(grants, request);
  }

  /**
   * Access inspector: the decision plus the grants that were considered — the
   * "why can Karim see the ledger?" trace from rbac-design.md. Ships with the
   * engine so any decision is auditable.
   */
  async explain(
    request: AccessRequest,
  ): Promise<{ decision: AccessDecision; considered: Grant[] }> {
    const considered = await this.effectiveGrants(request);
    return { decision: evaluate(considered, request), considered };
  }
}
```

Modify `apps/api/src/common/authz/authz.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { AuthzService } from './authz.service';
import { AccessModule } from '../../modules/access/access.module';

@Global()
@Module({
  imports: [AccessModule],
  providers: [AuthzService],
  exports: [AuthzService],
})
export class AuthzModule {}
```

Update the now-broken `apps/api/src/common/authz/authz.service.spec.ts` to construct `AuthzService` with a fake `AccessRepository`, keeping it a fast, DB-free unit test — the DB-backed behaviour is what Step 6's integration test proves:

```ts
import { describe, it, expect } from 'vitest';
import { AuthzService } from './authz.service';
import type { AccessRequest } from './authz.types';
import type { AccessRepository } from '../../modules/access/access.repository';

const request: AccessRequest = {
  principal: { userId: 'u1', roles: [], scopes: [] },
  resource: 'finance.ledger',
  action: 'read',
  scope: 'district.1.club.10',
};

function fakeAccessRepository(): AccessRepository {
  return { effectiveGrants: async () => [] } as unknown as AccessRepository;
}

describe('AuthzService', () => {
  it('denies by default while no grants resolve', async () => {
    const service = new AuthzService(fakeAccessRepository());
    const decision = await service.authorize(request);
    expect(decision).toEqual({ allowed: false, reason: 'default-deny' });
  });

  it('explain() returns the considered set alongside the decision', async () => {
    const service = new AuthzService(fakeAccessRepository());
    const { decision, considered } = await service.explain(request);
    expect(considered).toEqual([]);
    expect(decision.allowed).toBe(false);
  });
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @toastmasters/api test:int -- access-resolution`
Expected: PASS (both new tests).

- [ ] **Step 9: Verify the wider gate is still green**

Run: `pnpm --filter @toastmasters/api test && pnpm --filter @toastmasters/api test:int && pnpm --filter @toastmasters/db build && pnpm lint && pnpm typecheck && pnpm build`
Expected: no errors; every unit and integration test green, including the pre-existing `authz.service.spec.ts` (now DB-free again) and the two new `exactOnly` cases in `evaluate.spec.ts`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/common/authz apps/api/src/modules/access packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/test/integration/access-resolution.int-spec.ts
git commit -m "feat(access): wire real grant resolution into authorize()"
```

---

## Slice 5 — permission_version + cache

**Why:** Resolution (Slice 4) touches five tables per `authorize()` call — untenable per request. `rbac-design.md` §5 fixes this with a resolved-grant cache keyed `personId:permissionVersion`, invalidated by bumping the version rather than evicting — which is also what lets a role change take effect without the affected person re-logging in.

**Scoping decision.** §5's full table names four cache layers and six version-bump triggers. Only one trigger exists yet: **role assignment created or ended** (Slice 2's `RoleAssignmentRepository`). Unit-policy changes, direct-grant changes, and role-template edits have no backing table until Slice 6; org-unit reparenting and program-year rollover are out of scope for M1 entirely (`roadmap.md` — reparent already ships in Slice 1 but nothing yet reads a cache keyed by path). So this slice wires exactly one layer (resolved grant set, 5 min TTL) and exactly one trigger (role assignment write). The other three cache layers and five remaining triggers are noted, not built, so Slice 6 extends rather than restructures.

**The session half of the ship criteria doesn't exist yet, and isn't built here.** "Appoint a role mid-session... without re-login" and "stale `v` triggers rebuild" describe a live JWT session — Slice 8 (Login + session) is what mints a token carrying `v` and reissues it. Nothing about the cache mechanism depends on Slice 8 existing first, though: `personId:permissionVersion` is a plain cache key today, tested directly through `AuthzService.authorize()` without any HTTP/session machinery. When Slice 8 lands, `v` in the JWT literally _is_ `permissionVersion` — comparing it and rebuilding on mismatch is a small addition there, not a rework here.

**Dependency added this slice:** `ioredis` as a direct `apps/api` dependency (approved by the human — BullMQ already pulls it in transitively, but pnpm's strict layout means `apps/api` can't import a transitive package). Pinned to `5.11.1`, the version already resolved in the lockfile via `bullmq`, to avoid a second copy.

**Files:**

- Modify: `apps/api/package.json` (add `ioredis`)
- Modify: `apps/api/src/modules/identity/role-assignment.repository.ts` (`assign`/`end` bump `person.permission_version` in the same transaction)
- Create: `apps/api/test/support/test-redis.ts` (Testcontainers Redis, mirrors `test-db.ts`)
- Create: `apps/api/src/modules/access/redis-client.token.ts`
- Create: `apps/api/src/modules/access/grant-cache.service.ts`
- Modify: `apps/api/src/modules/access/access.repository.ts` (optional cache, transparently used when wired)
- Modify: `apps/api/src/modules/access/access.module.ts` (provides `REDIS_CLIENT` + `GrantCacheService`)
- Create: `apps/api/test/integration/access-cache.int-spec.ts`

**Interfaces:**

- Consumes: `RoleAssignmentRepository` (Slice 2, extended here), `AccessRepository`/`AuthzService` (Slice 4).
- Produces:
  - `GrantCacheService.get(personId, permissionVersion): Promise<Grant[] | null>` / `.set(personId, permissionVersion, grants): Promise<void>` — TTL 5 minutes, key `access:grants:${personId}:${permissionVersion}`.
  - `AccessRepository`'s constructor gains an **optional** third-position... second-position `cache?: GrantCacheService` parameter. Every existing call site (`new AccessRepository(db)`, Slices 4's tests) is unaffected — no cache means always-fresh resolution, exactly today's behaviour. This is also the correct resilience shape for production: a Redis outage degrades to slower-but-correct, never to wrong.
  - `RoleAssignmentRepository.assign()`/`.end()` — same signatures, now additionally bump `person.permission_version` by 1, atomically with the role_assignment write.

- [ ] **Step 1: Bump `permission_version` on role assignment write**

Modify `apps/api/src/modules/identity/role-assignment.repository.ts`:

```ts
  /** Always creates status: 'active' — M1 has no pending-approval workflow. */
  async assign(input: {
    personId: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    termStart: Date;
    termEnd: Date;
    appointedBy: string;
  }): Promise<RoleAssignment> {
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.roleAssignment.create({
        data: {
          personId: input.personId,
          orgUnitId: input.orgUnitId,
          role: input.role,
          programYearId: input.programYearId,
          termStart: input.termStart,
          termEnd: input.termEnd,
          status: 'active',
          appointedBy: input.appointedBy,
          trainedAt: [],
        },
      });
      // rbac-design.md §5: role assignment created/ended bumps permission_version.
      await tx.person.update({
        where: { id: input.personId },
        data: { permissionVersion: { increment: 1 } },
      });
      return created;
    });
    return toRoleAssignment(row);
  }

  /** Ended assignments are retained as history, never deleted. */
  async end(id: string, reason: RoleAssignmentEndedReason): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.roleAssignment.update({
        where: { id },
        data: { status: 'ended', endedReason: reason },
      });
      await tx.person.update({
        where: { id: updated.personId },
        data: { permissionVersion: { increment: 1 } },
      });
    });
  }
```

`findById`/`findActiveForUnit` are unchanged.

Run: `pnpm --filter @toastmasters/api test:int` — expect PASS still (Slice 2/4 tests don't assert on `permissionVersion`, so this is additive; nothing should break).

- [ ] **Step 2: Add the Redis test harness**

Create `apps/api/test/support/test-redis.ts`:

```ts
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import Redis from 'ioredis';

async function start(): Promise<{ container: StartedTestContainer; url: string }> {
  const container = await new GenericContainer('redis:7')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  // Same IPv4-loopback fix as test-db.ts — Docker Desktop's port-forwarding
  // proxy races IPv6 resolution of 'localhost' on some platforms.
  const host = container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
  const url = `redis://${host}:${container.getMappedPort(6379)}`;

  return { container, url };
}

/** Suite-level: start once, reuse across tests, stop in afterAll. */
export async function startTestRedis(): Promise<{
  client: Redis;
  stop: () => Promise<void>;
}> {
  const { container, url } = await start();
  const client = new Redis(url);
  return {
    client,
    stop: async () => {
      client.disconnect();
      await container.stop();
    },
  };
}
```

- [ ] **Step 3: Write the failing cache integration tests**

Create `apps/api/test/integration/access-cache.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantCacheService } from '../../src/modules/access/grant-cache.service';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('Access resolution cache (integration)', () => {
  let db: PrismaClient;
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;

  let clubId: string;
  let clubPath: string;
  let club2Id: string;
  let club2Path: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop: stopDb } = await startTestDb());
    const redis = await startTestRedis();
    stopRedis = redis.stop;
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);
    const cache = new GrantCacheService(redis.client);
    authz = new AuthzService(new AccessRepository(db, cache));

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1',
      name: 'Club 1',
      timezone: 'Asia/Dhaka',
    });
    const club2 = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c2',
      name: 'Club 2',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubPath = club.path;
    club2Id = club2.id;
    club2Path = club2.path;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;
  });
  afterAll(async () => {
    await stopDb();
    await stopRedis();
  });

  it('a role assignment mid-session takes effect on the next check (permission_version bump)', async () => {
    const member = await people.create({ email: 'member@example.com', fullName: 'New Treasurer' });
    const request = {
      principal: { userId: member.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read' as const,
      scope: clubPath,
    };

    const before = await authz.authorize(request);
    expect(before.allowed).toBe(false);

    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: clubId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: member.id,
    });

    const after = await authz.authorize(request);
    expect(after.allowed).toBe(true);
  });

  it('serves a stale cached grant set until permission_version actually changes', async () => {
    // A distinct club (club2), not clubId — reusing clubId collides with the
    // first test's still-active club_treasurer@clubId assignment against
    // Slice 2's role_assignment_singleton index.
    const treasurer = await people.create({
      email: 'stale@example.com',
      fullName: 'Stale Treasurer',
    });
    const assignment = await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: club2Id,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });
    const request = {
      principal: { userId: treasurer.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read' as const,
      scope: club2Path,
    };

    const first = await authz.authorize(request);
    expect(first.allowed).toBe(true);

    // Mutate the assignment directly, bypassing the repository's version
    // bump — a real revocation goes through RoleAssignmentRepository.end(),
    // which does bump the version (proved by the next assertion).
    await db.roleAssignment.update({ where: { id: assignment.id }, data: { status: 'ended' } });

    const stillCached = await authz.authorize(request);
    expect(stillCached.allowed).toBe(true); // same permissionVersion key -> stale cache hit

    await roleAssignments.end(assignment.id, 'resigned');

    const afterRealEnd = await authz.authorize(request);
    expect(afterRealEnd.allowed).toBe(false); // new version -> fresh resolution
  });
});
```

Run: `pnpm --filter @toastmasters/api test:int -- access-cache` — expect FAIL (`GrantCacheService` doesn't exist; `AccessRepository` doesn't accept a second constructor argument yet).

- [ ] **Step 4: Implement `GrantCacheService`**

Create `apps/api/src/modules/access/redis-client.token.ts`:

```ts
/** DI token for the shared ioredis client — Redis itself isn't a class Nest can key providers by. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
```

Create `apps/api/src/modules/access/grant-cache.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Grant } from '../../common/authz/authz.types';
import { REDIS_CLIENT } from './redis-client.token';

const TTL_SECONDS = 5 * 60;

/** rbac-design.md §5: resolved grant set, 5 min TTL, keyed personId:permissionVersion. */
@Injectable()
export class GrantCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(personId: string, permissionVersion: number): string {
    return `access:grants:${personId}:${permissionVersion}`;
  }

  async get(personId: string, permissionVersion: number): Promise<Grant[] | null> {
    const raw = await this.redis.get(this.key(personId, permissionVersion));
    return raw ? (JSON.parse(raw) as Grant[]) : null;
  }

  async set(personId: string, permissionVersion: number, grants: Grant[]): Promise<void> {
    await this.redis.set(
      this.key(personId, permissionVersion),
      JSON.stringify(grants),
      'EX',
      TTL_SECONDS,
    );
  }
}
```

- [ ] **Step 5: Wire the optional cache into `AccessRepository`**

Modify `apps/api/src/modules/access/access.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Grant } from '../../common/authz/authz.types';
import type { GrantCacheService } from './grant-cache.service';

interface PathRow {
  path: string;
}

@Injectable()
export class AccessRepository {
  constructor(
    private readonly db: PrismaClient = getPrisma(),
    private readonly cache?: GrantCacheService,
  ) {}

  /**
   * rbac-design.md §4.2 + §5: platform ∪ domain-role-template grants, cached
   * by personId:permissionVersion when a cache is wired. No cache means
   * always-fresh resolution — correctness never depends on Redis being up.
   */
  async effectiveGrants(personId: string): Promise<Grant[]> {
    const permissionVersion = await this.permissionVersionOf(personId);

    if (this.cache) {
      const cached = await this.cache.get(personId, permissionVersion);
      if (cached) return cached;
    }

    const [platformGrants, domainGrants] = await Promise.all([
      this.platformRoleGrants(personId),
      this.domainRoleGrants(personId),
    ]);
    const grants = [...platformGrants, ...domainGrants];

    if (this.cache) {
      await this.cache.set(personId, permissionVersion, grants);
    }

    return grants;
  }

  private async permissionVersionOf(personId: string): Promise<number> {
    const person = await this.db.person.findUnique({
      where: { id: personId },
      select: { permissionVersion: true },
    });
    return person?.permissionVersion ?? 1;
  }

  // ...platformRoleGrants / domainRoleGrants / grantsForRoleAtScope / pathOf / regionRootPath unchanged from Slice 4...
}
```

- [ ] **Step 6: Wire `REDIS_CLIENT` and `GrantCacheService` into `AccessModule`**

Modify `apps/api/src/modules/access/access.module.ts`:

```ts
import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConnectionOptions, type Env } from '@toastmasters/config';
import { ENV } from '../../config/config.module';
import { AccessRepository } from './access.repository';
import { GrantCacheService } from './grant-cache.service';
import { REDIS_CLIENT } from './redis-client.token';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(redisConnectionOptions(env.REDIS_URL)),
    },
    GrantCacheService,
    AccessRepository,
  ],
  exports: [AccessRepository],
})
export class AccessModule {}
```

`ConfigModule` is `@Global()` (already loaded via `AppModule`), so `ENV` is injectable here without an explicit `imports: [ConfigModule]`.

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm --filter @toastmasters/api test:int -- access-cache`
Expected: PASS (both tests).

- [ ] **Step 8: Verify the wider gate is still green**

Run: `pnpm --filter @toastmasters/api test && pnpm --filter @toastmasters/api test:int && pnpm lint && pnpm typecheck && pnpm build`
Expected: no errors; every unit and integration test green, including the unchanged Slice 1/2/3/4 integration suites (they construct `AccessRepository`/`RoleAssignmentRepository` the same way as before — the new parameters are additive and optional).

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/identity/role-assignment.repository.ts apps/api/src/modules/access apps/api/test/support/test-redis.ts apps/api/test/integration/access-cache.int-spec.ts
git commit -m "feat(access): cache resolved grants, invalidated by permission_version"
```

---

## Slice 6 — Delegation, overrides, break-glass, audit

**Why:** `effectiveGrants` (Slice 4) unions four sources but only two produce anything — platform-role and domain-role-template grants. Unit-policy overrides and direct person grants have been `[]` positions since Slice 4 specifically because their tables didn't exist. They exist now. This slice also finally builds `system_admin`'s real authority — Slice 3 seeded it zero grants and Slice 4 explicitly left its bypass unbuilt because it needs an audit trail, which this slice's `audit_event` table provides.

**How `system_admin` actually resolves (a real design decision, not the canonical sketch).** `rbac-design.md` §4.1 sketches `system_admin` as a hardcoded step-0 bypass ("always allowed, always logged") _before_ grant resolution. This deployment's divergence (`docs/superpowers/specs/...` §6) replaces that: _"the `system_admin` resolution grants everything except the four restricted resources."_ The word **resolution** is doing the work — it says this flows through the normal `effectiveGrants` → `evaluate()` pipeline as synthesized grants, not a separate short-circuit. So `AccessRepository.platformRoleGrants()` gets one addition: when the role is `system_admin`, instead of querying (empty) `role_template_grant` rows, synthesize an `allow`/`any` grant for every **non-restricted** resource's `allowed_actions`, at the assigned scope. No new branch in `evaluate()` or `authorize()` at all — the existing engine already does the right thing once it has the right grants.

**Break-glass is the existing direct-grant mechanism, reused, not a new table** (per the divergence spec §6.2). `mintBreakGlass` is a _separate_ operation from ordinary delegation — it deliberately does **not** go through `canDelegate` (by definition `system_admin` doesn't hold standing restricted-resource access, so it would always fail that check). It's gated instead on actually holding the `system_admin` platform role, and it writes both the `person_grant` row and an audit event for the mint, atomically.

**Audit-on-read is general, not `system_admin`-specific.** `rbac-design.md` §2.1: restricted resources are "always logged on read" — stated as a resource-catalogue property, not a `system_admin` special case. So the hook lives in `AuthzService.authorize()` itself: after any **allowed** `read` decision on a resource whose `sensitivity = 'restricted'`, write an `audit_event`. This applies uniformly — a club treasurer's ordinary ledger read gets logged exactly like `system_admin`'s break-glass read. One mechanism, not two.

**Scoping decision: `unit_policy_grant` is built, its own delegation-gating is not.** The roadmap's ship criteria don't name `unit_policy_grant` directly, but `rbac-design.md` §12's worked example ("Club Admin hides the ledger from the SAA — `unit_policy_grant` deny on `finance.ledger:read`... deny wins") and the platform-tier spec's own testing checklist ("deny in a unit policy beats a template allow") both call for it, and it's the third of `effectiveGrants`'s four union positions — leaving it out means Slice 4's union is still incomplete after this slice. What's _not_ built: gating _who_ may create a `unit_policy_grant` through `canDelegate` — no ship criterion exercises that path, and `person_grant` creation (which _is_ ship-gated, via the escalation-blocking criterion) already proves `canDelegate` works. Noted inline as a follow-up, not silently skipped.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (add `UnitPolicyGrant`, `PersonGrant`, `AuditEvent` models + `UnitPolicySubjectKind`, `AuditEventType` enums; append-only `REVOKE UPDATE, DELETE` on `audit_event`, hand-added like the ltree indexes)
- Create: `packages/db/prisma/migrations/<ts>_delegation_audit/migration.sql`
- Create: `apps/api/src/common/authz/can-delegate.ts`
- Create: `apps/api/src/common/authz/can-delegate.spec.ts`
- Modify: `apps/api/src/modules/access/access.repository.ts` (`unitPolicyOverrides`, `personGrants` sources; `system_admin` grant synthesis; `auditRestrictedReadIfApplicable`; `pathOf`/`regionRootPath` made reusable)
- Modify: `apps/api/src/common/authz/authz.service.ts` (calls the audit hook after an allowed decision)
- Create: `apps/api/src/modules/access/grant-admin.repository.ts` (`grantPersonGrant` — `canDelegate`-gated; `mintBreakGlass`; `createUnitPolicyGrant`; `grantPlatformRole`; `revokePlatformRole` — last-`unit_admin` guard)
- Modify: `apps/api/src/modules/access/access.module.ts` (registers `GrantAdminRepository`)
- Create: `apps/api/test/integration/access-delegation.int-spec.ts` (escalation blocked, last `unit_admin`, unit-policy deny-beats-allow)
- Create: `apps/api/test/integration/access-break-glass.int-spec.ts` (break-glass flow, expired direct grant, broad non-restricted `system_admin` access)

**Interfaces:**

- Consumes: `evaluate.ts`'s `scopeCovers` (Slice 4), `AccessRepository.effectiveGrants` (Slice 4/5), `platform_role_assignment` (Slice 4).
- Produces:
  - `canDelegate(actorGrants: Grant[], target: { resource, action, scope }): boolean` — pure, no DB, matches `rbac-design.md` §7.4/§12 exactly.
  - `GrantAdminRepository.grantPersonGrant(input): Promise<PersonGrant>` — throws unless `canDelegate` passes for the actor.
  - `GrantAdminRepository.mintBreakGlass(input): Promise<PersonGrant>` — requires the caller to hold `system_admin`; not `canDelegate`-gated; also writes a `break_glass_mint` audit event.
  - `GrantAdminRepository.grantPlatformRole(input)` / `.revokePlatformRole(id)` — the latter refuses to remove the last active `unit_admin` for a unit.
  - `GrantAdminRepository.createUnitPolicyGrant(input)` — ungated (see scoping note above).
  - `AccessRepository.effectiveGrants` — now genuinely all four §4.2 sources; `system_admin` resolves to broad non-restricted access; a restricted `read` that's allowed writes an `audit_event`.

- [ ] **Step 1: Add the schema**

In `packages/db/prisma/schema.prisma`, append:

```prisma
enum UnitPolicySubjectKind {
  role
  person
}

model UnitPolicyGrant {
  id              String                @id @default(uuid()) @db.Uuid
  orgUnitId       String                @map("org_unit_id") @db.Uuid
  orgUnit         OrgUnit               @relation(fields: [orgUnitId], references: [id])
  subjectKind     UnitPolicySubjectKind @map("subject_kind")
  subjectRole     String?               @map("subject_role")
  subjectPersonId String?               @map("subject_person_id") @db.Uuid
  subjectPerson   Person?               @relation("UnitPolicyGrantSubject", fields: [subjectPersonId], references: [id])
  resource        String
  resourceRef     ResourceCatalog       @relation(fields: [resource], references: [resource])
  action          PermissionAction
  condition       PermissionCondition   @default(any)
  effect          PermissionEffect
  createdBy       String                @map("created_by") @db.Uuid
  createdByPerson Person                @relation("UnitPolicyGrantCreatedBy", fields: [createdBy], references: [id])
  createdAt       DateTime              @default(now()) @map("created_at")
  reason          String
  expiresAt       DateTime?             @map("expires_at")

  @@map("unit_policy_grant")
}

model PersonGrant {
  id              String              @id @default(uuid()) @db.Uuid
  personId        String              @map("person_id") @db.Uuid
  person          Person              @relation("PersonGrantSubject", fields: [personId], references: [id])
  orgUnitId       String              @map("org_unit_id") @db.Uuid
  orgUnit         OrgUnit             @relation(fields: [orgUnitId], references: [id])
  resource        String
  resourceRef     ResourceCatalog     @relation(fields: [resource], references: [resource])
  action          PermissionAction
  condition       PermissionCondition @default(any)
  effect          PermissionEffect
  grantedBy       String              @map("granted_by") @db.Uuid
  grantedByPerson Person              @relation("PersonGrantGrantedBy", fields: [grantedBy], references: [id])
  grantedAt       DateTime            @default(now()) @map("granted_at")
  reason          String
  expiresAt       DateTime?           @map("expires_at")

  @@map("person_grant")
}

enum AuditEventType {
  break_glass_mint
  restricted_read
}

model AuditEvent {
  id            String            @id @default(uuid()) @db.Uuid
  occurredAt    DateTime          @default(now()) @map("occurred_at")
  actorPersonId String            @map("actor_person_id") @db.Uuid
  actorPerson   Person            @relation(fields: [actorPersonId], references: [id])
  type          AuditEventType
  resource      String?
  action        PermissionAction?
  orgUnitId     String?           @map("org_unit_id") @db.Uuid
  orgUnit       OrgUnit?          @relation(fields: [orgUnitId], references: [id])
  reason        String?
  metadata      Json              @default("{}")

  @@map("audit_event")
}
```

Add the reverse relations to `Person` (`platformRoleAssignments`/`grantedPlatformRoles` already exist from Slice 4):

```prisma
model Person {
  // ...existing fields...
  unitPolicyGrantsAsSubject UnitPolicyGrant[] @relation("UnitPolicyGrantSubject")
  unitPolicyGrantsCreated   UnitPolicyGrant[] @relation("UnitPolicyGrantCreatedBy")
  personGrantsReceived      PersonGrant[]     @relation("PersonGrantSubject")
  personGrantsIssued        PersonGrant[]     @relation("PersonGrantGrantedBy")
  auditEvents               AuditEvent[]
}
```

And to `OrgUnit`:

```prisma
model OrgUnit {
  // ...existing fields...
  unitPolicyGrants UnitPolicyGrant[]
  personGrants     PersonGrant[]
  auditEvents      AuditEvent[]
}
```

- [ ] **Step 2: Generate the migration, add the append-only guard, review, apply with `migrate deploy`**

Run: `pnpm --filter @toastmasters/db exec prisma migrate dev --create-only --name delegation_audit`
Strip the usual spurious `DROP INDEX "org_unit_path_gist"` / `"org_unit_path_unique"` (same false-positive drift as every prior slice). Then append, per CLAUDE.md's append-only rule (DoD item 4 — enforced at the DB layer, not by convention):

```sql
-- audit_event is append-only at the database, not by convention.
REVOKE UPDATE, DELETE ON "audit_event" FROM CURRENT_USER;
```

> Skip this if the migrating role must retain those privileges to run future migrations against this table (e.g. an `ALTER TABLE` on `audit_event` itself would then fail) — in that case grant migrations should run as a separate, more-privileged role. For this deployment's single-role local/CI setup, revoking from `CURRENT_USER` is correct and matches the existing pattern of hand-added SQL after `--create-only`.

Then: `pnpm --filter @toastmasters/db exec prisma migrate deploy && pnpm --filter @toastmasters/db exec prisma generate`

- [ ] **Step 3: `canDelegate` — write the failing tests, then implement**

Create `apps/api/src/common/authz/can-delegate.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canDelegate } from './can-delegate';
import type { Grant } from './authz.types';

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'club_president',
    scope: 'district.1.club.10',
    resource: 'meeting.role',
    action: 'update',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

describe('canDelegate', () => {
  it('allows delegating a grant the actor already holds at the target scope', () => {
    const actorGrants = [grant()];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10',
      }),
    ).toBe(true);
  });

  it('blocks escalation: cannot delegate a resource/action the actor does not hold anywhere (rbac-design.md §12)', () => {
    const actorGrants = [grant()]; // only meeting.role:update at the club
    expect(
      canDelegate(actorGrants, { resource: 'platform.audit', action: 'read', scope: 'district.1' }),
    ).toBe(false);
  });

  it('blocks delegating a grant the actor holds at a different scope', () => {
    const actorGrants = [grant({ scope: 'district.1.club.99' })];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10',
      }),
    ).toBe(false);
  });

  it('respects exactOnly identically to evaluate() — a self_unit grant does not cover a child scope', () => {
    const actorGrants = [grant({ exactOnly: true })];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10.sub',
      }),
    ).toBe(false);
  });

  it('ignores a deny grant — denies never confer delegation authority', () => {
    const actorGrants = [grant({ effect: 'deny' })];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10',
      }),
    ).toBe(false);
  });
});
```

Run: `pnpm --filter @toastmasters/api test -- can-delegate` — expect FAIL (module doesn't exist).

Create `apps/api/src/common/authz/can-delegate.ts`:

```ts
import type { Action, Grant } from './authz.types';
import { scopeCovers } from './evaluate';

/**
 * rbac-design.md §7.4: an actor may only delegate (grant to someone else) a
 * resource/action it already holds `allow` for at a scope covering the
 * target. This is the one guard every grant-creation path must pass through
 * — including what an invitation carrying roles would call — or invites
 * become a privilege-escalation route (§11).
 */
export function canDelegate(
  actorGrants: readonly Grant[],
  target: { resource: string; action: Action; scope: string },
): boolean {
  return actorGrants.some(
    (g) =>
      g.effect === 'allow' &&
      g.resource === target.resource &&
      g.action === target.action &&
      scopeCovers(g.scope, target.scope, g.exactOnly),
  );
}
```

Run: `pnpm --filter @toastmasters/api test -- can-delegate` — expect PASS (all five cases).

- [ ] **Step 4: Extend `AccessRepository`**

Modify `apps/api/src/modules/access/access.repository.ts` — four changes: complete the union with the two remaining sources, synthesize `system_admin`'s broad grant, add the restricted-read audit hook, and make the path helpers reusable by `GrantAdminRepository`.

```ts
import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Action, Grant } from '../../common/authz/authz.types';
import type { GrantCacheService } from './grant-cache.service';

interface PathRow {
  path: string;
}

// A function, not a module-level constant — `new Date()` must be evaluated
// fresh on every call. A frozen constant would capture "now" once at import
// time, and Testcontainers startup alone can take 10+ seconds, long enough
// for an "already expired" fixture in a later test to still compare as valid
// against a comparison timestamp captured before the module even loaded.
// (Found by actually running Step 7's "expired direct grant" test — it
// passed against a fresh `new Date()` per call and failed against a frozen
// constant, exactly as it should.)
function notExpired() {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

@Injectable()
export class AccessRepository {
  constructor(
    private readonly db: PrismaClient = getPrisma(),
    private readonly cache?: GrantCacheService,
  ) {}

  /** rbac-design.md §4.2 + §5: all four grant sources, cached by personId:permissionVersion. */
  async effectiveGrants(personId: string): Promise<Grant[]> {
    const permissionVersion = await this.permissionVersionOf(personId);

    if (this.cache) {
      const cached = await this.cache.get(personId, permissionVersion);
      if (cached) return cached;
    }

    const [platformGrants, domainGrants, overrideGrants, directGrants] = await Promise.all([
      this.platformRoleGrants(personId),
      this.domainRoleGrants(personId),
      this.unitPolicyOverrides(personId),
      this.personGrants(personId),
    ]);
    const grants = [...platformGrants, ...domainGrants, ...overrideGrants, ...directGrants];

    if (this.cache) {
      await this.cache.set(personId, permissionVersion, grants);
    }

    return grants;
  }

  /**
   * rbac-design.md §2.1: restricted resources are "always logged on read".
   * Called from AuthzService.authorize() after an allowed decision — applies
   * uniformly to every role, not just system_admin's break-glass reads.
   */
  async auditRestrictedReadIfApplicable(request: {
    principal: { userId: string };
    resource: string;
    action: Action;
  }): Promise<void> {
    if (request.action !== 'read') return;
    const catalog = await this.db.resourceCatalog.findUnique({
      where: { resource: request.resource },
    });
    if (catalog?.sensitivity !== 'restricted') return;
    await this.db.auditEvent.create({
      data: {
        actorPersonId: request.principal.userId,
        type: 'restricted_read',
        resource: request.resource,
        action: request.action,
      },
    });
  }

  private async permissionVersionOf(personId: string): Promise<number> {
    const person = await this.db.person.findUnique({
      where: { id: personId },
      select: { permissionVersion: true },
    });
    return person?.permissionVersion ?? 1;
  }

  private async platformRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.platformRoleAssignment.findMany({
      where: { personId, ...notExpired() },
    });
    const out: Grant[] = [];
    for (const pa of assignments) {
      const scope = pa.orgUnitId ? await this.pathOf(pa.orgUnitId) : await this.regionRootPath();
      if (pa.role === 'system_admin') {
        out.push(...(await this.systemAdminGrants(scope)));
        continue;
      }
      out.push(...(await this.grantsForRoleAtScope(pa.role, scope)));
    }
    return out;
  }

  /**
   * The deployment's break-glass divergence (docs/superpowers/specs/...  §6):
   * system_admin's *resolution* grants everything except the four restricted
   * resources — not a role_template_grant row (Slice 3 seeded none), and not
   * a step-0 bypass in evaluate()/authorize() (rbac-design.md §4.1's sketch).
   * Restricted access only ever comes from a minted break-glass person_grant.
   */
  private async systemAdminGrants(scope: string): Promise<Grant[]> {
    const resources = await this.db.resourceCatalog.findMany({
      where: { sensitivity: { not: 'restricted' } },
    });
    const out: Grant[] = [];
    for (const r of resources) {
      for (const action of r.allowedActions) {
        out.push({
          role: 'system_admin',
          scope,
          resource: r.resource,
          action,
          condition: 'any',
          effect: 'allow',
        });
      }
    }
    return out;
  }

  private async domainRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.roleAssignment.findMany({
      where: { personId, status: 'active' },
    });
    const out: Grant[] = [];
    for (const ra of assignments) {
      const scope = await this.pathOf(ra.orgUnitId);
      out.push(...(await this.grantsForRoleAtScope(ra.role, scope)));
    }
    return out;
  }

  /**
   * rbac-design.md §4.2(c): unit-policy overrides apply to the unit itself —
   * exactOnly, regardless of the overridden role's own scope_rule. Matches
   * against either a direct person subject or the person's active domain
   * roles at that unit.
   */
  private async unitPolicyOverrides(personId: string): Promise<Grant[]> {
    const activeRoles = await this.db.roleAssignment.findMany({
      where: { personId, status: 'active' },
      select: { role: true, orgUnitId: true },
    });
    const rows = await this.db.unitPolicyGrant.findMany({
      where: {
        ...notExpired(),
        OR: [
          { subjectKind: 'person', subjectPersonId: personId },
          ...(activeRoles.length
            ? [
                {
                  subjectKind: 'role' as const,
                  subjectRole: { in: activeRoles.map((r) => r.role) },
                  orgUnitId: { in: activeRoles.map((r) => r.orgUnitId) },
                },
              ]
            : []),
        ],
      },
    });
    const out: Grant[] = [];
    for (const ov of rows) {
      const scope = await this.pathOf(ov.orgUnitId);
      out.push({
        role: `policy:${ov.orgUnitId}`,
        scope,
        exactOnly: true,
        resource: ov.resource,
        action: ov.action,
        condition: ov.condition,
        effect: ov.effect,
      });
    }
    return out;
  }

  /** rbac-design.md §4.2(d): direct grants — exceptions, expiry enforced here. */
  private async personGrants(personId: string): Promise<Grant[]> {
    const rows = await this.db.personGrant.findMany({ where: { personId, ...notExpired() } });
    const out: Grant[] = [];
    for (const pg of rows) {
      const scope = await this.pathOf(pg.orgUnitId);
      out.push({
        role: `direct:${pg.reason}`,
        scope,
        exactOnly: true,
        resource: pg.resource,
        action: pg.action,
        condition: pg.condition,
        effect: pg.effect,
      });
    }
    return out;
  }

  /** Shared by both role-template grant sources: look up the template once, stamp scope + exactOnly. */
  private async grantsForRoleAtScope(role: string, scope: string): Promise<Grant[]> {
    const template = await this.db.roleTemplate.findUnique({ where: { role } });
    if (!template) return []; // role not in the catalogue — nothing to grant
    const exactOnly = template.scopeRule === 'self_unit';
    const rows = await this.db.roleTemplateGrant.findMany({ where: { role } });
    return rows.map((g) => ({
      role,
      scope,
      exactOnly,
      resource: g.resource,
      action: g.action,
      condition: g.condition,
      effect: g.effect,
    }));
  }

  /** Not private — GrantAdminRepository resolves target scopes for canDelegate the same way. */
  async pathOf(orgUnitId: string): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE id = ${orgUnitId}::uuid
    `;
    if (!rows[0]) throw new Error(`Org unit ${orgUnitId} not found`);
    return rows[0].path;
  }

  /**
   * A platform_role_assignment with org_unit_id = NULL means global reach —
   * resolved to the region root's own path, so ordinary prefix matching
   * covers the whole tree with no special-casing needed in evaluate().
   */
  async regionRootPath(): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE type = 'region' LIMIT 1
    `;
    if (!rows[0]) throw new Error('No region root org unit exists');
    return rows[0].path;
  }
}
```

- [ ] **Step 5: Wire the audit hook into `AuthzService`**

Modify `apps/api/src/common/authz/authz.service.ts`'s `authorize()`:

```ts
  /** The one authorization gate. Everything funnels through here (default-deny). */
  async authorize(request: AccessRequest): Promise<AccessDecision> {
    const grants = await this.effectiveGrants(request);
    const decision = evaluate(grants, request);
    if (decision.allowed) {
      await this.accessRepository.auditRestrictedReadIfApplicable(request);
    }
    return decision;
  }
```

(`effectiveGrants`/`explain` are unchanged.)

- [ ] **Step 6: Implement `GrantAdminRepository`**

Create `apps/api/src/modules/access/grant-admin.repository.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import { canDelegate } from '../../common/authz/can-delegate';
import type { Action, Condition } from '../../common/authz/authz.types';
import { AccessRepository } from './access.repository';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

@Injectable()
export class GrantAdminRepository {
  constructor(
    private readonly db: PrismaClient = getPrisma(),
    private readonly accessRepository: AccessRepository = new AccessRepository(),
  ) {}

  /** rbac-design.md §7.4/§12: the one guard every grant-creation path needs, or invitations carrying roles become an escalation route. */
  async grantPersonGrant(input: {
    actorId: string;
    personId: string;
    orgUnitId: string;
    resource: string;
    action: Action;
    condition?: Condition;
    reason: string;
    expiresAt?: Date | null;
  }) {
    const [actorGrants, scope] = await Promise.all([
      this.accessRepository.effectiveGrants(input.actorId),
      this.accessRepository.pathOf(input.orgUnitId),
    ]);
    if (!canDelegate(actorGrants, { resource: input.resource, action: input.action, scope })) {
      throw new ForbiddenException(
        `${input.actorId} cannot delegate ${input.resource}:${input.action} — does not hold it at this scope`,
      );
    }
    return this.db.personGrant.create({
      data: {
        personId: input.personId,
        orgUnitId: input.orgUnitId,
        resource: input.resource,
        action: input.action,
        condition: input.condition ?? 'any',
        effect: 'allow',
        grantedBy: input.actorId,
        reason: input.reason,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  /**
   * docs/superpowers/specs/...-super-admin-design.md §6: break-glass is the
   * existing direct-grant mechanism, reused. Deliberately NOT canDelegate-
   * gated — system_admin holds no standing restricted-resource access by
   * design, so it would always fail that check. Gated instead on actually
   * holding the system_admin platform role. Mints the grant and audits the
   * mint atomically.
   */
  async mintBreakGlass(input: {
    systemAdminPersonId: string;
    orgUnitId: string;
    resource: string;
    action: Action;
    reason: string;
    expiresAt?: Date;
  }) {
    const isSystemAdmin = await this.db.platformRoleAssignment.findFirst({
      where: { personId: input.systemAdminPersonId, role: 'system_admin' },
    });
    if (!isSystemAdmin) {
      throw new ForbiddenException('Only system_admin may mint break-glass access');
    }

    return this.db.$transaction(async (tx) => {
      const grant = await tx.personGrant.create({
        data: {
          personId: input.systemAdminPersonId,
          orgUnitId: input.orgUnitId,
          resource: input.resource,
          action: input.action,
          condition: 'any',
          effect: 'allow',
          grantedBy: input.systemAdminPersonId,
          reason: input.reason,
          expiresAt: input.expiresAt ?? new Date(Date.now() + FIFTEEN_MINUTES_MS),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPersonId: input.systemAdminPersonId,
          type: 'break_glass_mint',
          resource: input.resource,
          action: input.action,
          orgUnitId: input.orgUnitId,
          reason: input.reason,
        },
      });
      return grant;
    });
  }

  /** Test-fixture-level creation — see the Slice 6 plan's scoping note: not canDelegate-gated. */
  async createUnitPolicyGrant(input: {
    orgUnitId: string;
    subjectRole: string;
    resource: string;
    action: Action;
    effect: 'allow' | 'deny';
    createdBy: string;
    reason: string;
  }) {
    return this.db.unitPolicyGrant.create({
      data: {
        orgUnitId: input.orgUnitId,
        subjectKind: 'role',
        subjectRole: input.subjectRole,
        resource: input.resource,
        action: input.action,
        condition: 'any',
        effect: input.effect,
        createdBy: input.createdBy,
        reason: input.reason,
      },
    });
  }

  async grantPlatformRole(input: {
    personId: string;
    role: string;
    orgUnitId: string | null;
    grantedBy: string;
    expiresAt?: Date | null;
  }) {
    return this.db.platformRoleAssignment.create({
      data: {
        personId: input.personId,
        role: input.role,
        orgUnitId: input.orgUnitId,
        grantedBy: input.grantedBy,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  /**
   * rbac-design.md §7.2/§7.4: cannot remove the last unit_admin for a unit —
   * platform_role_assignment has no status/history field (unlike
   * role_assignment), so "revoke" is a hard delete here; that's acceptable
   * given how rare platform-role changes are meant to be (§6 table).
   */
  async revokePlatformRole(id: string): Promise<void> {
    const target = await this.db.platformRoleAssignment.findUnique({ where: { id } });
    if (!target) return;

    if (target.role === 'unit_admin' && target.orgUnitId) {
      const remaining = await this.db.platformRoleAssignment.count({
        where: {
          role: 'unit_admin',
          orgUnitId: target.orgUnitId,
          id: { not: id },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (remaining === 0) {
        throw new ForbiddenException('Cannot remove the last unit_admin for this unit');
      }
    }

    await this.db.platformRoleAssignment.delete({ where: { id } });
  }
}
```

Modify `apps/api/src/modules/access/access.module.ts` to register it:

```ts
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(redisConnectionOptions(env.REDIS_URL)),
    },
    GrantCacheService,
    AccessRepository,
    GrantAdminRepository,
  ],
  exports: [AccessRepository, GrantAdminRepository],
```

- [ ] **Step 7: Write the failing integration tests**

Create `apps/api/test/integration/access-delegation.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('Delegation and unit-policy overrides (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;
  let grantAdmin: GrantAdminRepository;

  let districtId: string;
  let clubId: string;
  let clubPath: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);
    const access = new AccessRepository(db);
    grantAdmin = new GrantAdminRepository(db, access);
    authz = new AuthzService(access);

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1',
      name: 'Club 1',
      timezone: 'Asia/Dhaka',
    });
    districtId = district.id;
    clubId = club.id;
    clubPath = club.path;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;
  });
  afterAll(async () => {
    await stop();
  });

  it('blocks a President from delegating a grant they do not hold (escalation via invitation)', async () => {
    const president = await people.create({
      email: 'president@example.com',
      fullName: 'President',
    });
    await roleAssignments.assign({
      personId: president.id,
      orgUnitId: clubId,
      role: 'club_president',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: president.id,
    });
    const nobody = await people.create({ email: 'nobody@example.com', fullName: 'Nobody Yet' });

    // The President's grants are all club-scoped; platform.audit at the
    // district is not among them — matches rbac-design.md §12's worked
    // example exactly.
    await expect(
      grantAdmin.grantPersonGrant({
        actorId: president.id,
        personId: nobody.id,
        orgUnitId: districtId,
        resource: 'platform.audit',
        action: 'read',
        reason: 'attempted escalation',
      }),
    ).rejects.toThrow();
  });

  it('refuses to remove the last unit_admin for a unit, but allows it when another remains', async () => {
    const admin1 = await people.create({ email: 'admin1@example.com', fullName: 'Admin One' });
    const admin2 = await people.create({ email: 'admin2@example.com', fullName: 'Admin Two' });

    const a1 = await grantAdmin.grantPlatformRole({
      personId: admin1.id,
      role: 'unit_admin',
      orgUnitId: clubId,
      grantedBy: admin1.id,
    });
    await expect(grantAdmin.revokePlatformRole(a1.id)).rejects.toThrow();

    const a2 = await grantAdmin.grantPlatformRole({
      personId: admin2.id,
      role: 'unit_admin',
      orgUnitId: clubId,
      grantedBy: admin1.id,
    });
    await expect(grantAdmin.revokePlatformRole(a1.id)).resolves.not.toThrow();
    // a2 is now the last one — removing it should fail in turn.
    await expect(grantAdmin.revokePlatformRole(a2.id)).rejects.toThrow();
  });

  it('a unit-policy deny beats a role-template allow (rbac-design.md §12)', async () => {
    const saa = await people.create({ email: 'saa@example.com', fullName: 'Sergeant at Arms' });
    await roleAssignments.assign({
      personId: saa.id,
      orgUnitId: clubId,
      role: 'club_member', // seeded with meeting.meeting:read — see Slice 3
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: saa.id,
    });
    const request = {
      principal: { userId: saa.id, roles: [], scopes: [] },
      resource: 'meeting.meeting',
      action: 'read' as const,
      scope: clubPath,
    };

    const before = await authz.authorize(request);
    expect(before.allowed).toBe(true);

    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubId,
      subjectRole: 'club_member',
      resource: 'meeting.meeting',
      action: 'read',
      effect: 'deny',
      createdBy: saa.id,
      reason: 'club policy: agenda is officers-only this term',
    });

    const after = await authz.authorize(request);
    expect(after.allowed).toBe(false);
  });
});
```

Create `apps/api/test/integration/access-break-glass.int-spec.ts`:

```ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('system_admin break-glass and direct-grant expiry (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let grantAdmin: GrantAdminRepository;

  let clubId: string;
  let clubPath: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    people = new PersonRepository(db);
    const access = new AccessRepository(db);
    grantAdmin = new GrantAdminRepository(db, access);
    authz = new AuthzService(access);

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1',
      name: 'Club 1',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubPath = club.path;
  });
  afterAll(async () => {
    await stop();
  });

  it('grants system_admin broad access to a non-restricted resource with no explicit template grant', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin@example.com',
      fullName: 'System Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });

    const decision = await authz.authorize({
      principal: { userId: sysAdmin.id, roles: [], scopes: [] },
      resource: 'meeting.meeting',
      action: 'read',
      scope: clubPath,
    });
    expect(decision.allowed).toBe(true);
  });

  it('denies system_admin a restricted read until it mints break-glass, then allows and audits it', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin2@example.com',
      fullName: 'System Admin Two',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });
    const request = {
      principal: { userId: sysAdmin.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read' as const,
      scope: clubPath,
    };

    const before = await authz.authorize(request);
    expect(before.allowed).toBe(false); // restricted — excluded from the broad synthesis

    await grantAdmin.mintBreakGlass({
      systemAdminPersonId: sysAdmin.id,
      orgUnitId: clubId,
      resource: 'finance.ledger',
      action: 'read',
      reason: 'investigating a member-reported discrepancy',
    });

    const after = await authz.authorize(request);
    expect(after.allowed).toBe(true);

    const events = await db.auditEvent.findMany({ where: { actorPersonId: sysAdmin.id } });
    expect(events.map((e) => e.type).sort()).toEqual(['break_glass_mint', 'restricted_read']);
  });

  it('treats an expired direct grant as inert', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin3@example.com',
      fullName: 'System Admin Three',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });
    await grantAdmin.mintBreakGlass({
      systemAdminPersonId: sysAdmin.id,
      orgUnitId: clubId,
      resource: 'finance.ledger',
      action: 'read',
      reason: 'already expired, for this test',
      expiresAt: new Date(Date.now() - 1000), // already in the past
    });

    const decision = await authz.authorize({
      principal: { userId: sysAdmin.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read',
      scope: clubPath,
    });
    expect(decision.allowed).toBe(false);
  });
});
```

Run: `pnpm --filter @toastmasters/api test:int -- access-delegation access-break-glass` — expect FAIL (`GrantAdminRepository`/`can-delegate` don't exist yet; `AccessRepository` doesn't expose `pathOf` publicly).

- [ ] **Step 8: Run it to verify everything passes**

Run: `pnpm --filter @toastmasters/api test:int` — expect PASS, all suites (harness, org, identity, access-seed, access-resolution, access-cache, access-delegation, access-break-glass).

- [ ] **Step 9: Verify the wider gate is still green**

Run: `pnpm --filter @toastmasters/api test && pnpm --filter @toastmasters/db build && pnpm lint && pnpm typecheck && pnpm build`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations apps/api/src/common/authz/can-delegate.ts apps/api/src/common/authz/can-delegate.spec.ts apps/api/src/common/authz/authz.service.ts apps/api/src/modules/access apps/api/test/integration/access-delegation.int-spec.ts apps/api/test/integration/access-break-glass.int-spec.ts
git commit -m "feat(access): delegation guard, unit-policy overrides, and system_admin break-glass"
```

---

## Slice 7 — Access inspector

**Why:** rbac-design.md §7.3: "Ship this in the same milestone as the permission engine. Retrofitting it means first building the thing that makes the engine debuggable, months after you needed it." Slices 4–6 built the engine; this slice makes it explainable — the forward trace ("why can Karim read the ledger?") and the two reverse queries ("what can Karim do at Club 1234?", "who can read `finance.ledger` anywhere?") — and ships the first real HTTP surface for it.

**Bug found while scoping this slice (fixed here, not deferred):** `AccessRepository` and `GrantAdminRepository` have only ever been constructed manually in tests (`new AccessRepository(db)`), never through NestJS's actual DI container. Their `db: PrismaClient` constructor parameter is a **type-only** import (`packages/db` deliberately does not export `PrismaClient` as a value — CLAUDE.md: "Don't `new PrismaClient()` ad hoc across the codebase"), so TypeScript emits no runtime type for it and Nest cannot derive an injection token. Booting `AccessModule` for real — which this slice's controller requires — throws `Nest can't resolve dependencies of the AccessRepository (?, Object)`. Confirmed by actually running `pnpm test:e2e` against the real containers (previously never run: it needs env vars `test:e2e`'s own config doesn't supply, so the bug was latent since Slice 4). This would have broken `pnpm dev` and production boot the moment any module was wired in — which Slice 7 is the first to do. Fixed in Step 1 below with the same `PRISMA_CLIENT` Symbol-token pattern `redis-client.token.ts` already uses for `GrantCacheService`. **Callout for Slice 8/9:** `org`/`identity` repositories have the identical `PrismaClient` default-param shape and no `*.module.ts` yet — whoever gives them a controller must apply the same token, or hit the same boot failure.

**Scoping decisions:**

- The trace format in §7.3 groups by _source_ (platform roles / one line per domain-role assignment / unit policy / direct grants), not by individual grant row. `Grant` gets an optional `source` tag (`{kind:'platform'|'domain_role'|'unit_policy'|'direct', ...}`) stamped by `AccessRepository` when it resolves grants. This is additive only — `evaluate()`, `scopeCovers()`, `canDelegate()` never read it, so Slices 4–6's behaviour is untouched. Verified by rerunning their full test suites unchanged after this change.
- The example's "@ Club 1234" is a friendly org-unit name; the resolver only has the `ltree` path at this layer (no name lookup exists below the inspector). Trace lines use the path instead (e.g. "@ d41.divA.a1.c1234") — a readable-enough approximation, not a byte-for-byte reproduction of the doc's illustration.
- `whoCanAccess` enumerates people holding an **allow** grant for `resource:action` from any of the four sources — it does not re-run `evaluate()` per candidate to reconcile a `deny` override that might sit on top of one of them elsewhere. Full reconciliation would need evaluating every candidate at every scope they hold, which is disproportionate for M1's "who holds this, roughly, for an access review" use case (rbac-design.md §7.3's own framing: "what you want when someone asks an uncomfortable question", not a certified decision). Flagged here so it isn't mistaken for `authorize()`-equivalent precision.
- All three inspector endpoints are gated identically via the existing `@ResourceScope('platform.audit', 'read')` + global `ResourceGuard` — no bespoke authorization code (CLAUDE.md: one gate, never scattered). For `who-can-access` ("anywhere"), the caller passes the **region root** path as `scope`; the ordinary prefix-match rule then only admits a caller whose `platform.audit:read` grant covers the whole tree (`system_admin`/`unit_admin` with `self_subtree`), which is exactly "anywhere" semantics, achieved with zero special-casing in the guard.
- The inspector's own controller is the **first real HTTP route** in the app (only `/health` exists so far). Login (Slice 8) doesn't exist yet, so its HTTP-level test mints a `jose` session JWT directly with the test `SESSION_JWT_SECRET`, the same shape `JwtAuthGuard` verifies — not a workaround, just exercising the guard without the piece that issues its input.

**Files:**

- Modify: `apps/api/src/common/authz/authz.types.ts` (add `GrantSource`, `Grant.source`)
- Modify: `apps/api/src/common/authz/evaluate.ts` (export `grantApplies`)
- Create: `apps/api/src/common/authz/explain.ts`, `explain.spec.ts`
- Create: `apps/api/src/modules/access/prisma-client.token.ts`
- Modify: `apps/api/src/modules/access/access.repository.ts` (`@Inject(PRISMA_CLIENT)`; stamp `source` on every resolved grant)
- Modify: `apps/api/src/modules/access/grant-admin.repository.ts` (`@Inject(PRISMA_CLIENT)`)
- Create: `apps/api/src/modules/access/access-inspector.repository.ts`
- Create: `apps/api/src/modules/access/access-inspector.controller.ts`
- Modify: `apps/api/src/modules/access/access.module.ts` (register token, new repository, new controller)
- Create: `apps/api/test/integration/access-inspector.int-spec.ts`, `access-inspector-http.int-spec.ts`

**Interfaces:**

```ts
// authz.types.ts additions
export type GrantSource =
  | { kind: 'platform'; role: string }
  | { kind: 'domain_role'; role: string; orgUnitId: string }
  | { kind: 'unit_policy'; orgUnitId: string }
  | { kind: 'direct'; reason: string };

export interface Grant {
  // ...existing fields unchanged...
  source?: GrantSource;
}
```

```ts
// explain.ts
export interface ExplainLine {
  label: string;
  detail: string;
  matched: boolean;
}
export interface ExplainResult {
  decision: AccessDecision;
  matchedGrant: Grant | null;
  lines: ExplainLine[];
  scopeCheck: { grantScope: string; targetScope: string; passed: boolean } | null;
  conditionCheck: { condition: string; passed: boolean } | null;
}
export function explain(grants: readonly Grant[], request: AccessRequest): ExplainResult;
export function renderExplain(
  personLabel: string,
  request: AccessRequest,
  result: ExplainResult,
): string;
```

```ts
// access-inspector.repository.ts
export class AccessInspectorRepository {
  async explainAccess(input: {
    personId: string;
    resource: string;
    action: Action;
    scope: string;
  }): Promise<{ personLabel: string; result: ExplainResult; text: string }>;
  async whatCanDoAt(
    personId: string,
    scope: string,
  ): Promise<Array<{ resource: string; action: Action; condition: Condition }>>;
  async whoCanAccess(
    resource: string,
    action: Action,
  ): Promise<Array<{ personId: string; fullName: string; scope: string; via: string }>>;
}
```

**TDD steps:**

- [ ] **Step 1: Fix the DI-boot bug — `PRISMA_CLIENT` token**

  Red — add a test that boots `AccessModule` for real and watch it fail with the dependency-resolution error:

  ```ts
  // apps/api/test/integration/access-inspector-http.int-spec.ts (first assertion, added early)
  import { Test } from '@nestjs/testing';
  import { AccessModule } from '../../src/modules/access/access.module';

  it('boots AccessModule through real Nest DI', async () => {
    await expect(
      Test.createTestingModule({ imports: [AccessModule] }).compile(),
    ).resolves.toBeDefined();
  });
  ```

  Confirm it fails with `Nest can't resolve dependencies of the AccessRepository (?, Object)` (it does — this is the bug being fixed, not a new one).

  Green:

  ```ts
  // prisma-client.token.ts
  /** DI token for the shared PrismaClient — the type is imported type-only, so Nest can't derive a token from it directly. */
  export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
  ```

  ```ts
  // access.module.ts
  import { getPrisma } from '@toastmasters/db';
  import { PRISMA_CLIENT } from './prisma-client.token';
  // ...
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    { provide: REDIS_CLIENT, inject: [ENV], useFactory: (env: Env) => new Redis(redisConnectionOptions(env.REDIS_URL)) },
    GrantCacheService,
    AccessRepository,
    GrantAdminRepository,
    AccessInspectorRepository,
  ],
  controllers: [AccessInspectorController],
  exports: [AccessRepository, GrantAdminRepository, AccessInspectorRepository],
  ```

  ```ts
  // access.repository.ts — constructor only
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly cache?: GrantCacheService,
  ) {}
  ```

  ```ts
  // grant-admin.repository.ts — constructor only
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly accessRepository: AccessRepository = new AccessRepository(),
  ) {}
  ```

  Rerun: the boot test passes, and every existing `access.repository.spec`/`*.int-spec.ts` still passes unchanged (they never went through Nest DI, so the manual-construction call sites are untouched).

- [ ] **Step 2: `explain()` — the forward decision trace**

  Red (`explain.spec.ts`):

  ```ts
  import { describe, it, expect } from 'vitest';
  import { explain } from './explain';
  import type { Grant, AccessRequest } from './authz.types';

  const request: AccessRequest = {
    principal: { userId: 'karim', roles: [], scopes: [] },
    resource: 'finance.ledger',
    action: 'read',
    scope: 'd41.divA.a1.c1234',
  };

  describe('explain', () => {
    it('names the matching grant and marks its line', () => {
      const grants: Grant[] = [
        {
          role: 'club_treasurer',
          scope: 'd41.divA.a1.c1234',
          resource: 'finance.ledger',
          action: 'read',
          condition: 'any',
          effect: 'allow',
          source: { kind: 'domain_role', role: 'club_treasurer', orgUnitId: 'club-1234' },
        },
      ];
      const result = explain(grants, request);
      expect(result.decision.allowed).toBe(true);
      expect(result.matchedGrant?.role).toBe('club_treasurer');
      const line = result.lines.find((l) => l.matched);
      expect(line?.detail).toContain('ALLOW');
      expect(line?.detail).toContain('← matched');
      expect(result.scopeCheck?.passed).toBe(true);
      expect(result.conditionCheck?.passed).toBe(true);
    });

    it('shows "none" for a source with zero grants, and default-denies with no matched grant', () => {
      const result = explain([], request);
      expect(result.decision.allowed).toBe(false);
      expect(result.decision.reason).toBe('default-deny');
      expect(result.matchedGrant).toBeNull();
      expect(result.lines.find((l) => l.label === 'platform roles')?.detail).toBe('none');
      expect(result.lines.find((l) => l.label === 'direct grants')?.detail).toBe('none');
    });

    it('a role with grants for other resources shows "no grant for X:Y", not "none"', () => {
      const grants: Grant[] = [
        {
          role: 'club_member',
          scope: 'd41.divA.a1.c1234',
          resource: 'meeting.meeting',
          action: 'read',
          condition: 'any',
          effect: 'allow',
          source: { kind: 'domain_role', role: 'club_member', orgUnitId: 'club-1234' },
        },
      ];
      const result = explain(grants, request);
      const line = result.lines.find((l) => l.label.startsWith('role:club_member'));
      expect(line?.detail).toBe('no grant for finance.ledger:read');
    });

    it("deny beats allow — matches rbac-design.md §12 and Slice 6's unit-policy scenario", () => {
      const grants: Grant[] = [
        {
          role: 'club_member',
          scope: 'd41.divA.a1.c1234',
          resource: 'finance.ledger',
          action: 'read',
          condition: 'any',
          effect: 'allow',
          source: { kind: 'domain_role', role: 'club_member', orgUnitId: 'club-1234' },
        },
        {
          role: 'policy:club-1234',
          scope: 'd41.divA.a1.c1234',
          exactOnly: true,
          resource: 'finance.ledger',
          action: 'read',
          condition: 'any',
          effect: 'deny',
          source: { kind: 'unit_policy', orgUnitId: 'club-1234' },
        },
      ];
      const result = explain(grants, request);
      expect(result.decision.allowed).toBe(false);
      expect(result.decision.reason).toBe('explicit-deny');
      expect(result.matchedGrant?.effect).toBe('deny');
    });
  });
  ```

  Green:

  ```ts
  // apps/api/src/common/authz/explain.ts
  import type { AccessDecision, AccessRequest, Grant } from './authz.types';
  import { evaluate, grantApplies } from './evaluate';

  export interface ExplainLine {
    label: string;
    detail: string;
    matched: boolean;
  }

  export interface ExplainResult {
    decision: AccessDecision;
    matchedGrant: Grant | null;
    lines: ExplainLine[];
    scopeCheck: { grantScope: string; targetScope: string; passed: boolean } | null;
    conditionCheck: { condition: string; passed: boolean } | null;
  }

  interface Group {
    label: string;
    grants: Grant[];
  }

  /** Groups resolved grants by source the way rbac-design.md §7.3's trace does. */
  function groupBySource(grants: readonly Grant[]): Group[] {
    const platform: Grant[] = [];
    const direct: Grant[] = [];
    const domainRoles = new Map<string, Group>();
    const unitPolicies = new Map<string, Group>();

    for (const grant of grants) {
      switch (grant.source?.kind) {
        case 'platform':
          platform.push(grant);
          break;
        case 'direct':
          direct.push(grant);
          break;
        case 'domain_role': {
          const key = `${grant.source.role}@${grant.source.orgUnitId}`;
          const group = domainRoles.get(key) ?? {
            label: `role:${grant.source.role} @ ${grant.scope}`,
            grants: [],
          };
          group.grants.push(grant);
          domainRoles.set(key, group);
          break;
        }
        case 'unit_policy': {
          const key = grant.source.orgUnitId;
          const group = unitPolicies.get(key) ?? {
            label: `unit policy ${grant.scope}`,
            grants: [],
          };
          group.grants.push(grant);
          unitPolicies.set(key, group);
          break;
        }
        default:
          // Untagged grant (e.g. hand-built in a unit test without `source`) —
          // still evaluated for the decision, just not attributable to a group.
          break;
      }
    }

    return [
      { label: 'platform roles', grants: platform },
      ...domainRoles.values(),
      ...unitPolicies.values(),
      { label: 'direct grants', grants: direct },
    ];
  }

  export function explain(grants: readonly Grant[], request: AccessRequest): ExplainResult {
    const decision = evaluate(grants, request);
    const applicable = grants.filter((g) => grantApplies(g, request));
    const winner =
      applicable.find((g) => g.effect === 'deny') ??
      applicable.find((g) => g.effect === 'allow') ??
      null;

    const lines: ExplainLine[] = groupBySource(grants).map((group) => {
      const matching = group.grants.filter((g) => grantApplies(g, request));
      if (matching.length === 0) {
        return {
          label: group.label,
          detail:
            group.grants.length === 0
              ? 'none'
              : `no grant for ${request.resource}:${request.action}`,
          matched: false,
        };
      }
      const picked = matching.find((g) => g === winner) ?? matching[0];
      const isWinner = picked === winner;
      return {
        label: group.label,
        detail: `${picked.effect.toUpperCase()}  ${request.resource}:${request.action} (${picked.condition})${isWinner ? '  ← matched' : ''}`,
        matched: isWinner,
      };
    });

    return {
      decision,
      matchedGrant: winner,
      lines,
      scopeCheck: winner
        ? { grantScope: winner.scope, targetScope: request.scope, passed: true }
        : null,
      conditionCheck: winner ? { condition: winner.condition, passed: true } : null,
    };
  }
  ```

  ```ts
  // evaluate.ts — only the visibility change
  export function grantApplies(grant: Grant, request: AccessRequest): boolean {
    /* unchanged body */
  }
  ```

  Rerun `explain.spec.ts` and `evaluate.spec.ts` — both green (the export change is additive).

- [ ] **Step 3: `renderExplain()` — the §7.3 text block**

  Red:

  ```ts
  it('renders the §7.3 shape for an allowed decision', () => {
    const grants: Grant[] = [
      {
        role: 'club_treasurer',
        scope: 'd41.divA.a1.c1234',
        resource: 'finance.ledger',
        action: 'read',
        condition: 'any',
        effect: 'allow',
        source: { kind: 'domain_role', role: 'club_treasurer', orgUnitId: 'club-1234' },
      },
    ];
    const result = explain(grants, request);
    const text = renderExplain('Karim Hossain', request, result);
    expect(text).toContain('Karim Hossain · finance.ledger · read · d41.divA.a1.c1234');
    expect(text).toContain('✓ ALLOW');
    expect(text).toContain('role:club_treasurer @ d41.divA.a1.c1234');
    expect(text).toContain('← matched');
    expect(text).toContain('Scope check:');
    expect(text).toContain('Condition:');
  });

  it('renders a default-deny with no matched-grant header', () => {
    const text = renderExplain('Nusrat', request, explain([], request));
    expect(text).toContain('✗ DENY');
    expect(text).not.toContain('Scope check:');
  });
  ```

  Green:

  ```ts
  export function renderExplain(
    personLabel: string,
    request: AccessRequest,
    result: ExplainResult,
  ): string {
    const header = `${personLabel} · ${request.resource} · ${request.action} · ${request.scope}`;
    const rule = '─'.repeat(header.length);
    const verdict = result.decision.allowed
      ? `✓ ALLOW  —  ${result.matchedGrant ? `${result.matchedGrant.role} @ ${result.matchedGrant.scope}` : ''}`
      : `✗ DENY  —  ${result.decision.reason}`;
    const traceLines = result.lines.map((l) => `  ${l.label.padEnd(32)}  ${l.detail}`);
    const parts = [header, rule, verdict, '', 'Evaluation trace:', ...traceLines];
    if (result.scopeCheck) {
      parts.push(
        '',
        `Scope check:  ${result.scopeCheck.grantScope}  within  ${result.scopeCheck.targetScope}   ✓`,
      );
    }
    if (result.conditionCheck) {
      parts.push(`Condition:    ${result.conditionCheck.condition}                            ✓`);
    }
    return parts.join('\n');
  }
  ```

  Rerun — green.

- [ ] **Step 4: Stamp `source` on every grant `AccessRepository` resolves**

  Red — extend `access-resolution.int-spec.ts` (or a new assertion in this slice's own integration spec) to assert `source` is present:

  ```ts
  const grants = await access.effectiveGrants(treasurer.id);
  const ledgerGrant = grants.find((g) => g.resource === 'finance.ledger' && g.action === 'read');
  expect(ledgerGrant?.source).toEqual({
    kind: 'domain_role',
    role: 'club_treasurer',
    orgUnitId: clubId,
  });
  ```

  Confirm it fails (`source` is `undefined` today).

  Green — thread a `source` through each private resolver and `grantsForRoleAtScope` (which gains a `source` parameter since it's shared between the platform and domain-role call sites):

  ```ts
  private async grantsForRoleAtScope(role: string, scope: string, source: GrantSource): Promise<Grant[]> {
    const template = await this.db.roleTemplate.findUnique({ where: { role } });
    if (!template) return [];
    const exactOnly = template.scopeRule === 'self_unit';
    const rows = await this.db.roleTemplateGrant.findMany({ where: { role } });
    return rows.map((g) => ({
      role, scope, exactOnly, resource: g.resource, action: g.action,
      condition: g.condition, effect: g.effect, source,
    }));
  }
  ```

  Call sites: `platformRoleGrants` passes `{ kind: 'platform', role: pa.role }` (and `systemAdminGrants` stamps the same shape on its synthesized rows); `domainRoleGrants` passes `{ kind: 'domain_role', role: ra.role, orgUnitId: ra.orgUnitId }`; `unitPolicyOverrides` passes `{ kind: 'unit_policy', orgUnitId: ov.orgUnitId }`; `personGrants` passes `{ kind: 'direct', reason: pg.reason }`.

  Rerun the new assertion and the full `access-resolution`/`access-cache`/`access-delegation`/`access-break-glass` suites — all green (source is additive; nothing reads it yet outside the new assertion).

- [ ] **Step 5: `AccessInspectorRepository.explainAccess()`**

  Red (`access-inspector.int-spec.ts`), reusing Slice 6's exact deny-beats-allow fixture:

  ```ts
  it('explains a deny-beats-allow decision, attributing the winning grant to unit policy', async () => {
    // ...same club_member + createUnitPolicyGrant(deny) setup as access-delegation.int-spec.ts...
    const { result, text } = await inspector.explainAccess({
      personId: saa.id,
      resource: 'meeting.meeting',
      action: 'read',
      scope: clubPath,
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.matchedGrant?.source).toEqual({ kind: 'unit_policy', orgUnitId: clubId });
    expect(text).toContain('✗ DENY');
  });
  ```

  Green:

  ```ts
  // access-inspector.repository.ts (relevant method only)
  async explainAccess(input: { personId: string; resource: string; action: Action; scope: string }) {
    const [person, grants] = await Promise.all([
      this.db.person.findUniqueOrThrow({ where: { id: input.personId }, select: { fullName: true } }),
      this.accessRepository.effectiveGrants(input.personId),
    ]);
    const request: AccessRequest = {
      principal: { userId: input.personId, roles: [], scopes: [] },
      resource: input.resource, action: input.action, scope: input.scope,
    };
    const result = explain(grants, request);
    return { personLabel: person.fullName, result, text: renderExplain(person.fullName, request, result) };
  }
  ```

  Rerun — green.

- [ ] **Step 6: `AccessInspectorRepository.whatCanDoAt()`**

  Red:

  ```ts
  it('lists only the resource:action pairs actually allowed at the target unit', async () => {
    // treasurer at clubId
    const grants = await inspector.whatCanDoAt(treasurer.id, clubPath);
    expect(grants).toContainEqual({ resource: 'finance.ledger', action: 'read', condition: 'any' });
    expect(
      grants.find((g) => g.resource === 'identity.role_assignment' && g.action === 'create'),
    ).toBeUndefined();
  });
  ```

  Green:

  ```ts
  async whatCanDoAt(personId: string, scope: string) {
    const grants = await this.accessRepository.effectiveGrants(personId);
    const pairs = new Map<string, { resource: string; action: Action; condition: Condition }>();
    for (const g of grants) pairs.set(`${g.resource}:${g.action}`, { resource: g.resource, action: g.action, condition: g.condition });
    const out: Array<{ resource: string; action: Action; condition: Condition }> = [];
    for (const pair of pairs.values()) {
      const decision = evaluate(grants, {
        principal: { userId: personId, roles: [], scopes: [] },
        resource: pair.resource, action: pair.action, scope,
        context: { isOwner: true, isAssigned: true, isParty: true, isPublished: true },
      });
      if (decision.allowed) out.push(pair);
    }
    return out;
  }
  ```

  (The all-context-true probe is a deliberate simplification, noted inline: it answers "could this ever apply here", not "does it apply to a specific row" — condition-gated grants like `club_member`'s `finance.ledger:read (own)` surface as a capability, matching §7.3's "show everything Karim can do" framing.)

  Rerun — green.

- [ ] **Step 7: `AccessInspectorRepository.whoCanAccess()`**

  Red — a scenario spanning all four sources: a `club_treasurer` (domain role), a `system_admin` (platform, non-restricted resource), a break-glass `person_grant` holder (direct), and a unit-policy allow override naming a role:

  ```ts
  it('enumerates holders from every grant source', async () => {
    const holders = await inspector.whoCanAccess('finance.ledger', 'read');
    const personIds = holders.map((h) => h.personId);
    expect(personIds).toContain(treasurer.id);
    expect(holders.find((h) => h.personId === treasurer.id)?.via).toBe('role:club_treasurer');
  });
  ```

  Green — enumerate and merge the four sources (query shapes as sketched in "Scoping decisions" above); dedupe on `personId:scope:via`.

  Rerun — green.

- [ ] **Step 8: `AccessInspectorController` + wiring, and the HTTP-level test**

  Red (`access-inspector-http.int-spec.ts`) — the DI-boot assertion from Step 1, plus:

  ```ts
  it('200s an actor holding platform.audit:read at the region root, 403s one who does not', async () => {
    // mint a jose JWT for a system_admin (holds platform.audit read via broad synthesis)
    // and a second for a plain club_member; hit GET /v1/access/inspector/who-can-access
    // ?resource=finance.ledger&action=read&scope=<regionRootPath> with each.
  });
  ```

  Green — the controller is thin, per CLAUDE.md (§4): parse query via Zod, call the repository, return JSON. `@ResourceScope('platform.audit', 'read')` on all three handlers; `scope` is a required query param read by the existing `ResourceGuard`.

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/common/authz apps/api/src/modules/access apps/api/test/integration/access-inspector.int-spec.ts apps/api/test/integration/access-inspector-http.int-spec.ts apps/api/test/integration/access-resolution.int-spec.ts
git commit -m "feat(access): access inspector — decision trace, reverse queries, and its endpoint"
```

---

## Slice 8 — Login + session

**Why:** the first two authenticated routes (Slice 7's inspector) so far have only ever been hit with a hand-minted `jose` JWT in a test. This slice builds the thing that actually issues that token: Argon2id credential verification, a `jose`-signed httpOnly session cookie carrying `{sub, activeUnitId, programYearId, v}`, and a unit-switch endpoint that reissues the cookie with only `activeUnitId` changed.

**Scoping decisions:**

- **No refresh-token rotation in M1.** CLAUDE.md's target stack (§3) is "Argon2id + short-lived access JWT + rotating, HMAC-hashed refresh tokens" — but the roadmap's own Slice 8 ship criteria ("Login sets an httpOnly cookie; JwtAuthGuard admits it; unit switch changes activeUnitId only") describe a single long-lived session cookie, not a refresh pair. M1's goal is proving the authorization model, not the full session-lifecycle hardening. Building refresh rotation is real, separate work; flagged here rather than silently skipped, so it's a known gap before this ships past M1, not a surprise.
- **No roles/scopes in the JWT.** CLAUDE.md §5: "Permissions are never embedded in the JWT." The session payload carries no role or grant data — `Principal.roles`/`.scopes` stay `[]` at login, exactly like every hand-built test principal since Slice 4. `authorize()` always re-resolves grants from `personId` against the database (through the `permission_version` cache), never from the token. The pre-existing `@Roles()` coarse-gate mechanism (scaffolded in Slice 0, never wired to a real route) stays unused until a slice actually needs tier gating.
- **`activeUnitId` is a UI convenience, not a security boundary.** It seeds the dashboard's default org-unit context; it is never read by `authorize()`, which always checks the request's real target scope. So `switchUnit` only validates that the target org unit _exists_ (`OrgUnitRepository.findById`), not that the caller has a role or membership there — a request against a scope the caller doesn't hold still 403s/404s through the normal gate regardless of what `activeUnitId` says. Both nullable: a platform-tier person with no club membership, or a deployment with no `program_year` marked `current` yet, can still log in.
- **No invite/registration flow.** Nothing in M1 sets a person's initial password — that's a future slice (self-service invite acceptance). `PersonRepository.setCredentials()` is the minimal seam a fixture (or, later, that flow) uses to give a `Person` a hash and flip them to `active`; Slice 8's own tests are its only caller for now.
- **Second latent DI-boot gap, same shape as Slice 7's, fixed here too:** `identity`'s four repositories and `org`'s `OrgUnitRepository` have the exact type-only-`PrismaClient` constructor shape Slice 7 found and fixed in `access` — and neither module has ever had a `*.module.ts`. Since `AuthService` needs `PersonRepository`, `ClubMembershipRepository`, `ProgramYearRepository`, and `OrgUnitRepository` wired through real Nest DI, this slice finally gives `identity`/`org` their modules and applies the `PRISMA_CLIENT` fix everywhere it was flagged as pending. The token itself moves from `modules/access/prisma-client.token.ts` to `common/db/prisma-client.token.ts` so three modules can share one canonical provider instead of each minting their own.

**Files:**

- Create: `apps/api/src/common/db/prisma-client.token.ts` (moved from `modules/access/`)
- Delete: `apps/api/src/modules/access/prisma-client.token.ts`
- Modify: `apps/api/src/modules/access/{access.repository,grant-admin.repository,access-inspector.repository,access.module}.ts` (import path only)
- Modify: `apps/api/src/modules/identity/{person,club-membership,program-year,role-assignment}.repository.ts` (`@Inject(PRISMA_CLIENT)`); `person.repository.ts` gains `setCredentials`/`findCredentialsByEmail`; `program-year.repository.ts` gains `findCurrent`
- Modify: `apps/api/src/modules/org/org.repository.ts` (`@Inject(PRISMA_CLIENT)`, gains `findById`)
- Create: `apps/api/src/modules/identity/identity.module.ts`, `apps/api/src/modules/org/org.module.ts`
- Modify: `apps/api/src/common/authz/authz.types.ts` (`Principal` gains optional `activeUnitId`/`programYearId`)
- Create: `apps/api/src/common/auth/session.types.ts`, `session.service.ts`, `session.service.spec.ts`
- Modify: `apps/api/src/common/auth/jwt-auth.guard.ts` (attach `activeUnitId`/`programYearId`/`v` to `request.user`)
- Create: `apps/api/src/common/auth/auth.service.ts`, `auth.service.spec.ts`, `auth.controller.ts`
- Modify: `apps/api/src/common/auth/auth.module.ts` (register everything above)
- Modify: `apps/api/src/main.ts` (`app.use(cookieParser())`)
- Modify: `packages/contracts/src/identity.ts` (`loginRequestSchema`, `switchUnitRequestSchema`, `sessionResponseSchema`)
- Create: `apps/api/test/integration/auth-session.int-spec.ts`, `auth-http.int-spec.ts`

**Interfaces:**

```ts
// common/auth/session.types.ts
export interface SessionClaims {
  sub: string; // personId
  activeUnitId: string | null;
  programYearId: string | null;
  v: number; // permissionVersion at issuance — carried forward verbatim on unit switch
}
```

```ts
// common/auth/session.service.ts
export class SessionService {
  issue(claims: SessionClaims): Promise<string>;
  cookieOptions(): { httpOnly: true; secure: boolean; sameSite: 'lax'; maxAge: number; path: '/' };
}
```

```ts
// common/auth/auth.service.ts
export class AuthService {
  login(email: string, password: string): Promise<{ token: string; session: SessionResponse }>;
  switchUnit(
    principal: Principal,
    orgUnitId: string,
  ): Promise<{ token: string; session: SessionResponse }>;
}
```

```ts
// packages/contracts/src/identity.ts additions
export const loginRequestSchema = z
  .object({ email: z.email(), password: z.string().min(1) })
  .strict();
export const switchUnitRequestSchema = z.object({ orgUnitId: z.uuid() }).strict();
export const sessionResponseSchema = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  activeUnitId: z.uuid().nullable(),
  programYearId: z.string().nullable(),
});
```

**TDD steps:**

- [ ] **Step 1: `PRISMA_CLIENT` → `common/db`; identity/org get real modules**

  Red — a DI-boot test for a not-yet-existing `IdentityModule`/`OrgModule` (same shape as Slice 7 Step 1's failing assertion), confirming `PersonRepository`/`OrgUnitRepository` can't resolve through Nest DI today.

  Green:

  ```ts
  // common/db/prisma-client.token.ts (moved verbatim from modules/access/)
  export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
  ```

  Update the four `access` files' import path, delete the old token file. Add `@Inject(PRISMA_CLIENT)` to the `db` parameter of `PersonRepository`, `ClubMembershipRepository`, `ProgramYearRepository`, `RoleAssignmentRepository`, `OrgUnitRepository` — identical mechanical change to Slice 7 Step 1.

  ```ts
  // modules/identity/identity.module.ts
  @Module({
    providers: [
      { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
      PersonRepository,
      ClubMembershipRepository,
      ProgramYearRepository,
      RoleAssignmentRepository,
    ],
    exports: [
      PersonRepository,
      ClubMembershipRepository,
      ProgramYearRepository,
      RoleAssignmentRepository,
    ],
  })
  export class IdentityModule {}
  ```

  ```ts
  // modules/org/org.module.ts
  @Module({
    providers: [{ provide: PRISMA_CLIENT, useFactory: () => getPrisma() }, OrgUnitRepository],
    exports: [OrgUnitRepository],
  })
  export class OrgModule {}
  ```

  Rerun the boot test — green. Rerun every existing integration suite unchanged (manual `new XRepository(db)` construction untouched).

- [ ] **Step 2: `SessionService` — issue a claims JWT**

  Red (`session.service.spec.ts`): issue a token, verify with `jose.jwtVerify` directly using the same secret, assert `sub`/`activeUnitId`/`programYearId`/`v` round-trip and `roles`/`scopes` are present but empty.

  Green: `SessionService` wraps `jose.SignJWT`, keyed off `ENV.SESSION_JWT_SECRET`/`SESSION_TTL_SECONDS`; `cookieOptions()` returns `secure: env.NODE_ENV === 'production'`.

  Rerun — green.

- [ ] **Step 3: Read/write seams — credentials, current program year, org-unit lookup**

  Red — repository-level integration assertions: `setCredentials` then `findCredentialsByEmail` round-trips a hash and flips `status` to `active`; `findCurrent` returns the one `program_year` row with `status = 'current'`; `OrgUnitRepository.findById` returns `null` for an unknown id.

  Green — add the four methods (plain Prisma reads/writes, no business logic, matching every other repository in the file).

  Rerun — green.

- [ ] **Step 4: `AuthService.login()`**

  Red (`auth.service.spec.ts`, mocking the four repositories/PasswordService/SessionService as plain objects — no DB, matching the unit-test layer in CLAUDE.md §7): unknown email → generic 401; known email with no `passwordHash` (never activated) → the same generic 401 (never leak _which_ reason); wrong password → same generic 401; correct credentials on an `active` person → issues a token whose claims match `{sub: person.id, v: person.permissionVersion}` and resolves `activeUnitId` from the person's primary, still-open club membership.

  Green — implement `login()`, resolving `programYearId` via `findCurrent()` and `activeUnitId` via `clubMemberships.findByPerson(...).find(m => m.isPrimary && !m.leftAt)?.clubUnitId ?? null`.

  Rerun — green.

- [ ] **Step 5: `AuthService.switchUnit()`**

  Red: switching to a real org unit reissues a token with the same `v`/`programYearId`, only `activeUnitId` changed; switching to an unknown org-unit id throws `NotFoundException`.

  Green — implement `switchUnit()`.

  Rerun — green.

- [ ] **Step 6: `AuthController`, cookie-parser wiring, and the login→cookie→admitted round trip**

  Red (`auth-http.int-spec.ts`, real Postgres + Redis via Testcontainers, real `AppModule`): `POST /v1/auth/login` with valid credentials sets an httpOnly `session` cookie and returns `{personId, fullName, activeUnitId, programYearId}` (never the hash, never the raw JWT in the body); a follow-up authenticated request presenting that cookie is admitted by `JwtAuthGuard`; wrong password → 401; `POST /v1/auth/switch-unit` with the session cookie changes `activeUnitId` only, confirmed by decoding the reissued cookie.

  Green — `@Public() @Post('login')`, `@Post('switch-unit')` (implicitly gated — no `@Public()`, so `JwtAuthGuard` requires an existing session); both `res.cookie('session', token, this.session.cookieOptions())`. `app.use(cookieParser())` added to `main.ts` (and the test's own app bootstrap, mirroring `enableVersioning`).

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/db apps/api/src/common/auth apps/api/src/common/authz/authz.types.ts apps/api/src/modules/access apps/api/src/modules/identity apps/api/src/modules/org apps/api/src/main.ts apps/api/package.json packages/contracts/src/identity.ts apps/api/test/integration/auth-session.int-spec.ts apps/api/test/integration/auth-http.int-spec.ts
git commit -m "feat(identity): login, httpOnly session cookie, and unit switching"
```

---

## Slice 9 — One meeting route through the gate (M1 ship gate)

**Why:** this is the milestone's own reason to exist. `roadmap.md`'s canonical ship gate is "A President creates a meeting and assigns a VPE; a member of another club cannot see it — the denial is a query-level 403/404, not a filtered-after-fetch" (`roadmap.md` line 149, `prd.md` FR-ACC-8). This slice wires two real, product-shaped HTTP routes through `authorize()` and proves both halves against real Postgres + Redis.

**Resolved ambiguity (flagged to the user before starting, per CLAUDE.md's "tell the human" rule):** the roadmap table's own Deliverable column ("meeting module") and Ship-criteria column ("President assigns a VPE") described two different resources, and the plan's own top-of-file Goal statement only mentioned the VPE assignment. Checked against `system-design.md` §7.5's permission matrix — "Meeting / agenda: Pres = R, VPE = **W**" — so **`club_vpe`, not `club_president`, creates meetings**, matching FR-MTG-1. User chose **"both, minimal"**: a bare `meeting.meeting:create` route plus the `identity.role_assignment` HTTP route, reusing everything built since Slice 2/4. Story: President appoints Karim as VPE (`identity.role_assignment`) → Karim (now VPE) creates a meeting (`meeting.meeting`) → a Club B member is denied at the guard, before any meeting row is ever queried.

**A real gap in the existing scaffold, closed here:** `@ResourceScope`/`ResourceGuard` (scaffolded in Phase 0, used as-is by Slice 7's inspector) only ever read a raw **ltree path** directly off `request.query.scope` — fine for an admin tool where the caller already knows internal paths, but wrong for a product route: a client says "club `f387e99c-...`", never a `d41.divA.a1.c1234` string. `ResourceGuard` now resolves `{source: 'param'|'query', key: 'orgUnitId'}` through a new `AuthzService.resolveScope()` (thin wrapper over `AccessRepository.pathOf`, 404 on an unknown unit) — exactly the shape CLAUDE.md §5 originally specified. Routes that omit `locate` keep today's raw-path behavior, so Slice 7's inspector endpoints are untouched and their existing tests must keep passing unchanged.

**Scoping decisions:**

- **`Meeting` is deliberately bare.** `system-design.md`'s full entity (agenda, roles, speech slots, theme, venue, format, lifecycle states, checklists) is out of scope — M1 needs a record to hang authorization on, not meeting operations (that's a later milestone). Fields: `id, clubUnitId, programYearId, scheduledAt, createdBy, createdAt`. No status/lifecycle column.
- **Routes are club-scoped in the URL** (`/v1/clubs/:clubUnitId/meetings`, `/v1/clubs/:clubUnitId/role-assignments`), not by a bare resource id, specifically so the guard can resolve scope from a path param _before_ touching the database for the target row — the strongest form of "query-level denial, not filtered-after-fetch": a sibling-club request is refused with zero meeting-table reads.
- **`meeting.meeting` gains a `create` action** (Slice 3 seeded only `read`/`update`) and `club_vpe` is granted it — the one seed change this slice needs, transcribed from `system-design.md` §7.5, same as every prior grant.
- **No GET route for `identity.role_assignment`.** The ship gate's negative-scope proof is the meeting read ("a member of another club cannot see **it**" — the meeting, the noun the sentence is about); adding a symmetric read-denial test for role assignments would be a second, redundant proof of the same guard mechanism.
- **List endpoint included** (`GET /v1/clubs/:clubUnitId/meetings`) even though not named in the ship criteria, because `rbac-design.md` §4.3 calls list endpoints "the part people get wrong" (`FR-AUTHZ-8`) and it costs nothing extra here: the query is `WHERE club_unit_id = :clubUnitId`, and `:clubUnitId` is only ever the guard-approved value — there is no code path where it could leak another club's rows.

**Files:**

- Modify: `apps/api/src/common/authz/resource-scope.decorator.ts`, `resource.guard.ts`, `authz.service.ts` (+ spec)
- Modify: `packages/db/prisma/schema.prisma` (`Meeting` model), `packages/db/src/seed.ts` (`meeting.meeting:create`, `club_vpe` grant), new migration
- Create: `apps/api/src/modules/meeting/{meeting.module,meeting.repository,meeting.controller}.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts` (add controller); Create: `apps/api/src/modules/identity/identity.controller.ts`
- Modify: `packages/contracts/src/identity.ts` (`createRoleAssignmentRequestSchema`); Create: `packages/contracts/src/meeting.ts`
- Create: `apps/api/test/integration/meeting.repository.int-spec.ts`, `ship-gate.int-spec.ts`

**Interfaces:**

```ts
// resource-scope.decorator.ts
export interface ResourceScopeMeta {
  resource: string;
  action: Action;
  /** Resolve scope from an org-unit id in the request, instead of a raw ltree path. Omit to keep the legacy `?scope=<path>` behavior (Slice 7's inspector). */
  locate?: { source: 'param' | 'query'; key: string };
}
export const ResourceScope = (resource: string, action: Action, locate?: ResourceScopeMeta['locate']) => ...;
```

```ts
// authz.service.ts addition
resolveScope(orgUnitId: string): Promise<string>; // pathOf(), 404 (NotFoundException) if the unit doesn't exist
```

```ts
// packages/contracts/src/meeting.ts
export const meeting = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export const createMeetingRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    scheduledAt: z.iso.datetime(),
  })
  .strict();
```

```ts
// packages/contracts/src/identity.ts addition
export const createRoleAssignmentRequestSchema = z
  .object({
    personId: z.uuid(),
    role: z.string().min(1),
    programYearId: z.string().min(1),
    termStart: z.iso.date(),
    termEnd: z.iso.date(),
  })
  .strict();
```

**TDD steps:**

- [ ] **Step 1: `@ResourceScope` locate + `AuthzService.resolveScope()`**

  Red (`authz.service.spec.ts` addition): `resolveScope('unknown-id')` rejects with `NotFoundException`; a real id resolves to the path `AccessRepository.pathOf` would return (mock the repository). A `resource.guard`-level test (new `resource.guard.spec.ts`, mocking `AuthzService`): a route with `locate: {source:'param', key:'clubUnitId'}` calls `resolveScope(request.params.clubUnitId)` and feeds the result to `authorize()`; a route with no `locate` still reads `request.query.scope` raw (today's behavior, unchanged).

  Green:

  ```ts
  // authz.service.ts addition
  async resolveScope(orgUnitId: string): Promise<string> {
    try {
      return await this.accessRepository.pathOf(orgUnitId);
    } catch {
      throw new NotFoundException('Org unit not found');
    }
  }
  ```

  ```ts
  // resource.guard.ts — the scope line only
  const scope = meta.locate
    ? await this.authz.resolveScope(
        (meta.locate.source === 'param' ? request.params : request.query)?.[meta.locate.key] ?? '',
      )
    : (request.params?.['scope'] ?? request.query?.['scope'] ?? '');
  ```

  Rerun — green. **Rerun Slice 7's `access-inspector-http.int-spec.ts` unchanged** — its routes declare no `locate`, so this must still pass byte-for-byte with no test edits.

- [ ] **Step 2: `Meeting` schema + seed**

  Red — extend `access.seed.int-spec.ts` (or a new assertion): `meeting.meeting`'s `allowedActions` includes `create`; `club_vpe`'s grants include `{resource:'meeting.meeting', action:'create', effect:'allow'}`; `club_president` does **not** hold it.

  Green — `prisma migrate dev --create-only`, hand-review (strip any spurious ltree `DROP INDEX`, per the standing correction), `prisma migrate deploy`:

  ```prisma
  model Meeting {
    id              String      @id @default(uuid()) @db.Uuid
    clubUnitId      String      @map("club_unit_id") @db.Uuid
    clubUnit        OrgUnit     @relation(fields: [clubUnitId], references: [id])
    programYearId   String      @map("program_year_id")
    programYear     ProgramYear @relation(fields: [programYearId], references: [id])
    scheduledAt     DateTime    @map("scheduled_at")
    createdBy       String      @map("created_by") @db.Uuid
    createdByPerson Person      @relation(fields: [createdBy], references: [id])
    createdAt       DateTime    @default(now()) @map("created_at")

    @@map("meeting")
  }
  ```

  Plus reverse relations on `OrgUnit`, `ProgramYear`, `Person`. In `seed.ts`: `meeting.meeting.allowedActions` gains `'create'`; `club_vpe.grants` gains `{ resource: 'meeting.meeting', action: 'create' }`.

  Rerun — green.

- [ ] **Step 3: `MeetingRepository` + `MeetingModule`**

  Red (`meeting.repository.int-spec.ts`): `create` persists a row scoped to its club; `findById` returns it; `findByClub` returns only that club's meetings, not a sibling club's.

  Green — plain Prisma CRUD, `@Inject(PRISMA_CLIENT)` from the start (no bug to rediscover this time — Slices 7/8 already proved the pattern).

  Rerun — green.

- [ ] **Step 4: `MeetingController`**

  Red — folded into Step 6's end-to-end test (a dedicated controller-only test would just re-exercise Step 1–3's already-green paths).

  Green:

  ```ts
  @Controller('clubs/:clubUnitId/meetings')
  export class MeetingController {
    constructor(private readonly meetings: MeetingRepository) {}

    @Post()
    @ResourceScope('meeting.meeting', 'create', { source: 'param', key: 'clubUnitId' })
    async create(
      @Param('clubUnitId', new ZodValidationPipe(z.uuid())) clubUnitId: string,
      @CurrentUser() principal: Principal,
      @Body(new ZodValidationPipe(createMeetingRequestSchema)) body: CreateMeetingRequest,
    ): Promise<MeetingResponse> {
      return this.meetings.create({
        clubUnitId,
        programYearId: body.programYearId,
        scheduledAt: new Date(body.scheduledAt),
        createdBy: principal.userId,
      });
    }

    @Get()
    @ResourceScope('meeting.meeting', 'read', { source: 'param', key: 'clubUnitId' })
    async list(
      @Param('clubUnitId', new ZodValidationPipe(z.uuid())) clubUnitId: string,
    ): Promise<MeetingResponse[]> {
      return this.meetings.findByClub(clubUnitId);
    }

    @Get(':meetingId')
    @ResourceScope('meeting.meeting', 'read', { source: 'param', key: 'clubUnitId' })
    async findOne(
      @Param('clubUnitId', new ZodValidationPipe(z.uuid())) clubUnitId: string,
      @Param('meetingId', new ZodValidationPipe(z.uuid())) meetingId: string,
    ): Promise<MeetingResponse> {
      const found = await this.meetings.findById(meetingId);
      if (!found || found.clubUnitId !== clubUnitId)
        throw new NotFoundException('Meeting not found');
      return found;
    }
  }
  ```

- [ ] **Step 5: `identity.controller.ts` — the VPE-assignment route**

  Green (no separate red — same shape as Step 4, exercised by Step 6):

  ```ts
  @Controller('clubs/:clubUnitId/role-assignments')
  export class IdentityController {
    constructor(private readonly roleAssignments: RoleAssignmentRepository) {}

    @Post()
    @ResourceScope('identity.role_assignment', 'create', { source: 'param', key: 'clubUnitId' })
    async assign(
      @Param('clubUnitId', new ZodValidationPipe(z.uuid())) clubUnitId: string,
      @CurrentUser() principal: Principal,
      @Body(new ZodValidationPipe(createRoleAssignmentRequestSchema))
      body: CreateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
      return this.roleAssignments.assign({
        personId: body.personId,
        orgUnitId: clubUnitId,
        role: body.role,
        programYearId: body.programYearId,
        termStart: new Date(body.termStart),
        termEnd: new Date(body.termEnd),
        appointedBy: principal.userId,
      });
    }
  }
  ```

- [ ] **Step 6: The M1 ship-gate test**

  Red (`ship-gate.int-spec.ts`, real Postgres + Redis, real `AppModule`, `jose`-minted JWTs — same harness shape as Slices 7/8's HTTP specs):

  1. Seed region → district → Club A, Club B; current program year; a President already active at Club A (bootstrapped directly via `RoleAssignmentRepository`, matching every prior test's pattern — appointing the _first_ officer isn't the thing under test).
  2. `POST /v1/clubs/:clubAId/role-assignments` as the President, `{personId: karim.id, role: 'club_vpe', ...}` → **200**, Karim is now `club_vpe` at Club A.
  3. `POST /v1/clubs/:clubAId/meetings` as Karim → **200**, meeting created.
  4. `GET /v1/clubs/:clubAId/meetings/:meetingId` as Karim → 200, returns the meeting.
  5. A Club B member (bootstrapped as `club_member` at Club B) hits `GET /v1/clubs/:clubAId/meetings/:meetingId` → **403** — the guard denies before `MeetingRepository.findById` ever runs.
  6. The same Club B member hits `GET /v1/clubs/:clubAId/meetings` (list) → **403** — same guard, same zero-rows-touched property.
  7. Karim's own `GET /v1/clubs/:clubAId/meetings` list → 200, contains exactly the one meeting.

  Green — wire `MeetingModule`/`IdentityModule`'s new controller into their existing modules; nothing else to implement — this step is verification of Steps 1–5, run for real.

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/authz apps/api/src/modules/meeting apps/api/src/modules/identity packages/db packages/contracts/src/meeting.ts packages/contracts/src/identity.ts packages/contracts/src/index.ts apps/api/test/integration/meeting.repository.int-spec.ts apps/api/test/integration/ship-gate.int-spec.ts
git commit -m "feat(meeting): meeting + VPE-assignment routes through the gate — M1 ship criterion"
```

---

## Slice 10 — Authorisation matrix + doc updates

Expanded to Slice 0–9 depth (files, interfaces, bite-sized TDD steps with full code) immediately before it is executed, against the now-proven foundation. Its deliverables, dependencies, and ship criteria are fixed in the roadmap table above; the canonical schema and algorithms it implements are `rbac-design.md` §3–§9 and `system-design.md` §5–§7, and the design decisions specific to this deployment are in `docs/superpowers/specs/2026-07-28-platform-tier-super-admin-design.md`.

**Self-review (this plan vs the spec):**

- Spec §3 authorisation model → Slices 4 (resolution/authorize), 5 (permission_version), 6 (canDelegate/overrides/direct grants), 7 (inspector). ✓
- Spec §4 org tree + region tier → Slice 1. ✓
- Spec §5 `system_admin` platform role → Slices 3 (seed) + 4 (resolution). ✓
- Spec §6 stricter break-glass + audit → Slice 6. ✓
- Spec §7 scope (identity, login, meeting route) → Slices 2, 8, 9. ✓
- Spec §9 testing / matrix → Slice 10 (plus per-slice negatives). ✓
- Spec §10 doc divergences → Slice 10. ✓
- No spec requirement is unassigned. `ltree` is a real column (not deferred), so `FR-AUTHZ-8` query-level filtering (M1's ship gate) is honoured, not postponed.
