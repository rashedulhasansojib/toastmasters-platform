# M1 Walking Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the authorisation model at a handful of real routes — a President assigns a VPE in their club; a member of another club cannot see it (query-level 403/404) — on the canonical RBAC engine, with the `system_admin` platform role and the region tier in place.

**Architecture:** One `ltree` org tree rooted at `region`; one `authorize()` gate (default-deny, deny-wins, scope = path prefix, five conditions); grants resolved from platform roles ∪ role-template assignments ∪ unit-policy overrides ∪ direct person grants; revocation via `permission_version`; delegation guarded by `canDelegate`; an access inspector shipped with the engine. Backed by Prisma 7 on Postgres, tested against a real Postgres via Testcontainers.

**Tech Stack:** NestJS 11 (api), Prisma 7 + `@prisma/adapter-pg` (packages/db), Postgres + `ltree`, Redis/BullMQ (permission cache), Zod 4 (packages/contracts), Vitest 4 + Testcontainers 12, Argon2id + `jose` (sessions).

> **Scope note.** This is the M1 milestone plan. It is delivered as ordered
> **slices** (§ "Slice roadmap"). Slices 0–4 below are fully detailed and
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

## Slices 5–10

Each is expanded to Slice 0/1/2/3/4 depth (files, interfaces, bite-sized TDD steps with full code) immediately before it is executed, against the now-proven foundation. Their deliverables, dependencies, and ship criteria are fixed in the roadmap table above; the canonical schema and algorithms they implement are `rbac-design.md` §3–§9 and `system-design.md` §5–§7, and the design decisions specific to this deployment are in `docs/superpowers/specs/2026-07-28-platform-tier-super-admin-design.md`.

**Self-review (this plan vs the spec):**

- Spec §3 authorisation model → Slices 4 (resolution/authorize), 5 (permission_version), 6 (canDelegate/overrides/direct grants), 7 (inspector). ✓
- Spec §4 org tree + region tier → Slice 1. ✓
- Spec §5 `system_admin` platform role → Slices 3 (seed) + 4 (resolution). ✓
- Spec §6 stricter break-glass + audit → Slice 6. ✓
- Spec §7 scope (identity, login, meeting route) → Slices 2, 8, 9. ✓
- Spec §9 testing / matrix → Slice 10 (plus per-slice negatives). ✓
- Spec §10 doc divergences → Slice 10. ✓
- No spec requirement is unassigned. `ltree` is a real column (not deferred), so `FR-AUTHZ-8` query-level filtering (M1's ship gate) is honoured, not postponed.
