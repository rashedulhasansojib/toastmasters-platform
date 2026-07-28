import { createPrismaClient } from '../src/client';
import { seedAccessVocabulary, seedPathwayCatalog } from '../src/seed';

async function main(): Promise<void> {
  const db = createPrismaClient();
  await seedAccessVocabulary(db);
  await seedPathwayCatalog(db);
  await db.$disconnect();
}

void main();
