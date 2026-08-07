import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createPrismaClient, type PrismaClient } from '@toastmasters/db';

// packages/db directory. The repo's tsconfig.base.json pins `module: commonjs`,
// so `import.meta.url` isn't usable here (TS1343) — resolve from process.cwd()
// instead, which is apps/api (the vitest root) whenever this runs as a test.
const DB_PACKAGE_DIR = resolve(process.cwd(), '../../packages/db');

/**
 * The role the app and the migrations run as.
 *
 * Deliberately NOT the image's `POSTGRES_USER`, which the postgres entrypoint
 * creates as a **superuser** — and a superuser bypasses every privilege check,
 * including the `REVOKE UPDATE, DELETE` that makes the ledger, audit, vote,
 * attendance, inventory and live-record tables append-only (NFR-4). Running
 * the suite as a superuser meant those REVOKEs were untested: a repository
 * that tried to update an append-only row passed here and failed in
 * production, where Neon's `neondb_owner` is not a superuser. This role
 * matches production, so the append-only invariant is actually exercised.
 */
const APP_ROLE = 'app';

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

  // Create the non-superuser owner and hand it the database, so `prisma
  // migrate deploy` runs as the same role the app will use — which is what
  // makes `REVOKE ... FROM CURRENT_USER` in a migration bind to that role.
  const psql = (sql: string) =>
    container.exec(['psql', '-U', 'test', '-d', 'test', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  for (const sql of [
    `CREATE ROLE "${APP_ROLE}" LOGIN PASSWORD '${APP_ROLE}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    `GRANT ALL ON DATABASE "test" TO "${APP_ROLE}"`,
    `GRANT ALL ON SCHEMA public TO "${APP_ROLE}"`,
    `ALTER SCHEMA public OWNER TO "${APP_ROLE}"`,
    // Neon provisions extensions for us; create them as the superuser here so
    // the app role never needs a privilege it does not have in production.
    'CREATE EXTENSION IF NOT EXISTS ltree',
  ]) {
    const { exitCode, output } = await psql(sql);
    if (exitCode !== 0) throw new Error(`test-db setup failed: ${sql}\n${output}`);
  }

  // container.getHost() returns 'localhost', which Node's pg driver can resolve
  // to the IPv6 loopback (::1) first. On Windows + Docker Desktop that races
  // against the port-forwarding proxy and the connection is closed immediately
  // ("Connection terminated unexpectedly"), even though the server is ready and
  // `prisma migrate deploy` (a separate connection path) succeeds. Forcing the
  // literal IPv4 loopback sidesteps the resolution race.
  const host = container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
  const url = `postgresql://${APP_ROLE}:${APP_ROLE}@${host}:${container.getMappedPort(5432)}/test?schema=public`;

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
