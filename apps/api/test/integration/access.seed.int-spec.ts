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

  it("grants club_vpe (not club_president) meeting.meeting:create — system-design.md §7.5's Meeting/agenda row", async () => {
    const meetingResource = await db.resourceCatalog.findUnique({
      where: { resource: 'meeting.meeting' },
    });
    expect(meetingResource?.allowedActions).toContain('create');

    const vpeCreate = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'club_vpe',
          resource: 'meeting.meeting',
          action: 'create',
          condition: 'any',
        },
      },
    });
    expect(vpeCreate?.effect).toBe('allow');

    const vpeRead = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'club_vpe',
          resource: 'meeting.meeting',
          action: 'read',
          condition: 'any',
        },
      },
    });
    expect(vpeRead?.effect).toBe('allow'); // create/update without read would be unusable

    const presidentCreate = await db.roleTemplateGrant.findMany({
      where: { role: 'club_president', resource: 'meeting.meeting', action: 'create' },
    });
    expect(presidentCreate).toHaveLength(0);
  });
});
