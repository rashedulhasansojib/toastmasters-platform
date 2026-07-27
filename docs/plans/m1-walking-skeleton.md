# M1 Walking Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the authorisation model at a handful of real routes — a President assigns a VPE in their club; a member of another club cannot see it (query-level 403/404) — on the canonical RBAC engine, with the `system_admin` platform role and the region tier in place.

**Architecture:** One `ltree` org tree rooted at `region`; one `authorize()` gate (default-deny, deny-wins, scope = path prefix, five conditions); grants resolved from platform roles ∪ role-template assignments ∪ unit-policy overrides ∪ direct person grants; revocation via `permission_version`; delegation guarded by `canDelegate`; an access inspector shipped with the engine. Backed by Prisma 7 on Postgres, tested against a real Postgres via Testcontainers.

**Tech Stack:** NestJS 11 (api), Prisma 7 + `@prisma/adapter-pg` (packages/db), Postgres + `ltree`, Redis/BullMQ (permission cache), Zod 4 (packages/contracts), Vitest 4 + Testcontainers 12, Argon2id + `jose` (sessions).

> **Scope note.** This is the M1 milestone plan. It is delivered as ordered
> **slices** (§ "Slice roadmap"). Slices 0–1 below are fully detailed and
> execution-ready. Each later slice is expanded to the same bite-sized TDD depth
> just before it is executed, so its code is written against a proven foundation
> rather than guessed. This matches roadmap.md §7 ("plans are living documents;
> each is a checklist of slices").

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

## Slices 2–10

Each is expanded to Slice 0/1 depth (files, interfaces, bite-sized TDD steps with full code) immediately before it is executed, against the now-proven foundation. Their deliverables, dependencies, and ship criteria are fixed in the roadmap table above; the canonical schema and algorithms they implement are `rbac-design.md` §3–§9 and `system-design.md` §5–§7, and the design decisions specific to this deployment are in `docs/superpowers/specs/2026-07-28-platform-tier-super-admin-design.md`.

**Self-review (this plan vs the spec):**

- Spec §3 authorisation model → Slices 4 (resolution/authorize), 5 (permission_version), 6 (canDelegate/overrides/direct grants), 7 (inspector). ✓
- Spec §4 org tree + region tier → Slice 1. ✓
- Spec §5 `system_admin` platform role → Slices 3 (seed) + 4 (resolution). ✓
- Spec §6 stricter break-glass + audit → Slice 6. ✓
- Spec §7 scope (identity, login, meeting route) → Slices 2, 8, 9. ✓
- Spec §9 testing / matrix → Slice 10 (plus per-slice negatives). ✓
- Spec §10 doc divergences → Slice 10. ✓
- No spec requirement is unassigned. `ltree` is a real column (not deferred), so `FR-AUTHZ-8` query-level filtering (M1's ship gate) is honoured, not postponed.
