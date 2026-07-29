/**
 * Dev-only: mint (or reset) a Person with a system_admin platform-role
 * assignment so the shipped UI has something to log into. The seed
 * (`packages/db/src/seed.ts`) populates reference vocabularies but no
 * users, and there's no chicken-and-egg-free invitation path.
 *
 * Refuses to run when NODE_ENV=production — this is a break-glass tool
 * for local development, not something to leave discoverable on a real
 * deployment.
 *
 * Implementation note: this hashes with argon2 locally, then executes
 * raw SQL through `prisma db execute` (Prisma's own binary engine)
 * rather than through the pg-driver-adapter PrismaClient. The adapter
 * hangs on Neon cold-start against this machine's network stack; the
 * Prisma engine connects reliably. Since we don't need to read data
 * back, `db execute` is enough.
 *
 * Usage:
 *   pnpm --filter @toastmasters/api bootstrap:admin
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... pnpm --filter @toastmasters/api bootstrap:admin
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as argon2 from 'argon2';

const DEFAULT_EMAIL = 'admin@admin.com';
const DEFAULT_PASSWORD = '12345678';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('✖ Refusing to run bootstrap-admin in production.');
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_EMAIL).toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  const fullName = process.env.ADMIN_NAME ?? 'Platform Admin';

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.warn('⚠  Using default dev credentials — never use these on a shared deployment.');
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // Prisma migrate reads DIRECT_URL from prisma.config.ts. `db execute`
  // uses the same datasource, so this runs against the direct (unpooled)
  // endpoint — appropriate for a one-shot admin task.
  const sql = buildBootstrapSql({ email, passwordHash, fullName });

  const dir = mkdtempSync(join(tmpdir(), 'bootstrap-admin-'));
  const sqlPath = join(dir, 'bootstrap.sql');
  try {
    writeFileSync(sqlPath, sql, { mode: 0o600 });
    execFileSync(
      'pnpm',
      ['--filter', '@toastmasters/db', 'exec', 'prisma', 'db', 'execute', '--file', sqlPath],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('');
  console.log('✓ Bootstrap admin ready.');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('  role:     system_admin (platform, global)');
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildBootstrapSql({
  email,
  passwordHash,
  fullName,
}: {
  email: string;
  passwordHash: string;
  fullName: string;
}): string {
  const e = sqlLiteral(email);
  const h = sqlLiteral(passwordHash);
  const n = sqlLiteral(fullName);
  // Every statement below is idempotent so the script can be re-run to
  // reset dev state without stacking duplicates.
  //
  //   1. Person: upsert on email.
  //   2. Global system_admin grant on that person (NOT EXISTS because
  //      @@unique doesn't enforce uniqueness across NULLs in Postgres —
  //      see the schema comment on PlatformRoleAssignment).
  //   3. A region root (org_unit_single_region_root allows only one).
  //   4. A Demo Club under that region — the switcher only shows units the
  //      person is scoped into; without one, the sidebar's club section
  //      never renders.
  //   5. The 2026-2027 ProgramYear (the string the login flow returns).
  //   6. Club- *and* region-scoped system_admin grants so both appear in
  //      switchable-units — findPlatformRoleOrgUnitIdsForPerson filters
  //      out NULL org_unit_id, so the global grant from step 2 is invisible
  //      to the switcher. The region row is what surfaces the platform admin
  //      console in the unit switcher; it adds no authority the global grant
  //      doesn't already confer (systemAdminGrants resolves the org-unit-less
  //      row at the region root path anyway) — it exists purely so the
  //      switcher has a region entry to select.
  return `
WITH upserted AS (
  INSERT INTO "person" (id, email, password_hash, full_name, status, mfa_enabled, permission_version, created_at)
  VALUES (gen_random_uuid(), ${e}, ${h}, ${n}, 'active', false, 1, now())
  ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    status = 'active',
    -- Resolved grants are Redis-cached for 5 min keyed personId:permissionVersion
    -- (GrantCacheService). This script adds grants, so without a bump a re-run's
    -- new scopes stay invisible until the TTL lapses. The bump is the sanctioned
    -- invalidation path (rbac-design.md §5) and costs no re-login — JwtAuthGuard
    -- silently reissues the cookie when the token's v claim is behind.
    permission_version = "person".permission_version + 1
  RETURNING id
),
_global_grant AS (
  INSERT INTO "platform_role_assignment" (id, person_id, role, org_unit_id, granted_by, granted_at)
  SELECT gen_random_uuid(), u.id, 'system_admin', NULL, u.id, now()
  FROM upserted u
  WHERE NOT EXISTS (
    SELECT 1 FROM "platform_role_assignment" pra
    WHERE pra.person_id = u.id
      AND pra.role = 'system_admin'
      AND pra.org_unit_id IS NULL
  )
  RETURNING 1
),
_region_new AS (
  INSERT INTO "org_unit" (id, type, parent_id, path, depth, name, code, status, timezone, updated_at)
  SELECT gen_random_uuid(), 'region', NULL, 'r1'::ltree, 0, 'Region', 'R1', 'active', 'Asia/Dhaka', now()
  WHERE NOT EXISTS (SELECT 1 FROM "org_unit" WHERE type = 'region')
  RETURNING id, path
),
region AS (
  SELECT id, path FROM _region_new
  UNION ALL
  SELECT id, path FROM "org_unit" WHERE type = 'region' LIMIT 1
),
_club_new AS (
  INSERT INTO "org_unit" (id, type, parent_id, path, depth, name, code, status, timezone, updated_at)
  SELECT gen_random_uuid(), 'club', r.id, (r.path::text || '.demo')::ltree, 1, 'Demo Club', 'DEMO', 'active', 'Asia/Dhaka', now()
  FROM region r
  WHERE NOT EXISTS (SELECT 1 FROM "org_unit" WHERE code = 'DEMO' AND type = 'club')
  RETURNING id
),
club AS (
  SELECT id FROM _club_new
  UNION ALL
  SELECT id FROM "org_unit" WHERE code = 'DEMO' AND type = 'club' LIMIT 1
),
_year AS (
  INSERT INTO "program_year" (id, starts_on, ends_on, status)
  VALUES ('2026-2027', DATE '2026-07-01', DATE '2027-06-30', 'current')
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
scoped AS (
  SELECT id FROM club
  UNION ALL
  SELECT id FROM region
)
INSERT INTO "platform_role_assignment" (id, person_id, role, org_unit_id, granted_by, granted_at)
SELECT gen_random_uuid(), u.id, 'system_admin', s.id, u.id, now()
FROM upserted u, scoped s
WHERE NOT EXISTS (
  SELECT 1 FROM "platform_role_assignment" pra
  WHERE pra.person_id = u.id
    AND pra.role = 'system_admin'
    AND pra.org_unit_id = s.id
);
`.trim();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
