import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createPrismaClient, type PrismaClient } from '@toastmasters/db';

// packages/db directory. The repo's tsconfig.base.json pins `module: commonjs`,
// so `import.meta.url` isn't usable here (TS1343) — resolve from process.cwd()
// instead, which is apps/api (the vitest root) whenever this runs as a test.
const DB_PACKAGE_DIR = resolve(process.cwd(), '../../packages/db');

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

  // container.getHost() returns 'localhost', which Node's pg driver can resolve
  // to the IPv6 loopback (::1) first. On Windows + Docker Desktop that races
  // against the port-forwarding proxy and the connection is closed immediately
  // ("Connection terminated unexpectedly"), even though the server is ready and
  // `prisma migrate deploy` (a separate connection path) succeeds. Forcing the
  // literal IPv4 loopback sidesteps the resolution race.
  const host = container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
  const url = `postgresql://test:test@${host}:${container.getMappedPort(5432)}/test?schema=public`;

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
