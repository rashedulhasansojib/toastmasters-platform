import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * Construct a PrismaClient wired through the node-postgres driver adapter.
 *
 * This package reads DATABASE_URL straight from the environment rather than
 * importing @toastmasters/config, because packages must not depend on one
 * another (CLAUDE.md boundaries). Apps validate env — including DATABASE_URL —
 * at boot via @toastmasters/config, so by the time a repository uses this the
 * value is already known-good.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot construct PrismaClient.');
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}
