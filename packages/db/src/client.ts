import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import ws from 'ws';
import { PrismaClient } from './generated/prisma/client';

// Prefer IPv4 for all DNS lookups from this process. Neon's `ep-*.neon.tech`
// hosts publish AAAA records, and Node ≥20's default happy-eyeballs picks
// the IPv6 address first. On networks where the IPv6 route silently drops
// packets, Node's fallback to IPv4 can take 60–75s per connect — long
// enough to look like the database is down. libcurl / Prisma's Rust engine
// don't have this problem because they either fall back faster or use a
// system resolver that ranks differently.
//
// This is a process-wide setting; it must run before any connect. Placing
// it at module scope in the package that ships the DB client guarantees
// it's active before the first repository is constructed.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

// @neondatabase/serverless connects over WebSocket. In Node it needs a
// polyfilled WebSocket constructor; browsers/edge runtimes provide their
// own. Setting this once at import time is safe — the value is a
// constructor, not per-connection state.
neonConfig.webSocketConstructor = ws;

/**
 * Construct a PrismaClient wired through the appropriate driver adapter.
 *
 *  - Neon endpoints (`*.neon.tech`) use `@prisma/adapter-neon`, Neon's
 *    own WebSocket-based driver.
 *  - Everything else (Testcontainers integration tests, self-hosted
 *    Postgres) uses `@prisma/adapter-pg`.
 *
 * This package reads DATABASE_URL straight from the environment rather
 * than importing @toastmasters/config, because packages must not depend
 * on one another (CLAUDE.md boundaries). Apps validate env — including
 * DATABASE_URL — at boot via @toastmasters/config, so by the time a
 * repository uses this the value is already known-good.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot construct PrismaClient.');
  }
  const adapter = isNeonUrl(url)
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}
