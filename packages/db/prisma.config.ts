import path from 'node:path';

import { defineConfig } from '@prisma/config';

// Prisma 7 no longer auto-loads .env when a config file is present, so load it
// ourselves. Try the package-local .env first, then the monorepo root. In
// CI/prod the real environment is already populated, so a missing file is fine
// — process.loadEnvFile throws when the file is absent, which we swallow.
for (const candidate of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), candidate));
    break;
  } catch {
    // Not present at this location — fall through to the next candidate.
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations connect through the DIRECT (unpooled) endpoint. The app
    // runtime uses the pooled DATABASE_URL via the pg driver adapter — see
    // src/client.ts. Undefined here is fine for commands that don't connect
    // (e.g. `prisma generate` during build).
    url: process.env.DIRECT_URL,
  },
});
