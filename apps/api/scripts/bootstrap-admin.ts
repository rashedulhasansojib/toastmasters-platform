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
  // Person: upsert on email. PlatformRoleAssignment: insert only if a
  // matching (person, 'system_admin', NULL) row doesn't already exist.
  // The schema's @@unique([personId, role, orgUnitId]) does not enforce
  // uniqueness across NULLs (see schema.prisma:797), so idempotency is
  // done through NOT EXISTS rather than ON CONFLICT.
  return `
WITH upserted AS (
  INSERT INTO "person" (id, email, password_hash, full_name, status, mfa_enabled, permission_version, created_at)
  VALUES (gen_random_uuid(), ${e}, ${h}, ${n}, 'active', false, 1, now())
  ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    status = 'active'
  RETURNING id
)
INSERT INTO "platform_role_assignment" (id, person_id, role, org_unit_id, granted_by, granted_at)
SELECT gen_random_uuid(), u.id, 'system_admin', NULL, u.id, now()
FROM upserted u
WHERE NOT EXISTS (
  SELECT 1 FROM "platform_role_assignment" pra
  WHERE pra.person_id = u.id
    AND pra.role = 'system_admin'
    AND pra.org_unit_id IS NULL
);
`.trim();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
