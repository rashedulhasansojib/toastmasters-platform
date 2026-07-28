import { createPrismaClient } from '../src/client';
import { seedAccessVocabulary } from '../src/seed';

async function main(): Promise<void> {
  const db = createPrismaClient();
  await seedAccessVocabulary(db);
  await db.$disconnect();
}

void main();
