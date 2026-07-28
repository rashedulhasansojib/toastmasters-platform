import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';

describe('seedAccessVocabulary (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
  });
  afterAll(async () => {
    await stop();
  });

  it('is idempotent — running it twice produces no duplicates and no errors', async () => {
    await seedAccessVocabulary(db);
    await seedAccessVocabulary(db);

    const resourceCount = await db.resourceCatalog.count();
    expect(resourceCount).toBe(7);
  });

  it('marks exactly the four canonical resources as restricted', async () => {
    const restricted = await db.resourceCatalog.findMany({
      where: { sensitivity: 'restricted' },
      orderBy: { resource: 'asc' },
    });
    expect(restricted.map((r) => r.resource)).toEqual([
      'education.evaluation',
      'finance.ledger',
      'membership.health_signal',
      'platform.audit',
    ]);
  });

  it('seeds the three platform roles', async () => {
    const platformRoles = await db.roleTemplate.findMany({
      where: { tier: 'platform' },
      orderBy: { role: 'asc' },
    });
    expect(platformRoles.map((r) => r.role)).toEqual([
      'support_readonly',
      'system_admin',
      'unit_admin',
    ]);
  });

  it('grants club_treasurer read access to finance.ledger, and gives club_vpe none', async () => {
    const treasurerGrant = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'club_treasurer',
          resource: 'finance.ledger',
          action: 'read',
          condition: 'any',
        },
      },
    });
    expect(treasurerGrant?.effect).toBe('allow');

    const vpeGrants = await db.roleTemplateGrant.findMany({
      where: { role: 'club_vpe', resource: 'finance.ledger' },
    });
    expect(vpeGrants).toHaveLength(0);
  });
});
