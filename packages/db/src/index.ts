import { createPrismaClient } from './client';

export { createPrismaClient } from './client';
export type { PrismaClient } from './generated/prisma/client';
export { Prisma } from './generated/prisma/client';
export { seedAccessVocabulary, seedPathwayCatalog } from './seed';

let singleton: ReturnType<typeof createPrismaClient> | undefined;

/**
 * The process-wide PrismaClient. Constructed once, lazily, on first use.
 * Only *.repository.ts (api) and worker processors may import this — enforced
 * by ESLint. Everything else goes through a repository.
 */
export function getPrisma(): ReturnType<typeof createPrismaClient> {
  singleton ??= createPrismaClient();
  return singleton;
}
