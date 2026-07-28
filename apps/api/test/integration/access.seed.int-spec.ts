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
    expect(resourceCount).toBe(19);
  });

  it('marks exactly the four canonical resources as restricted', async () => {
    const restricted = await db.resourceCatalog.findMany({
      where: { sensitivity: 'restricted' },
      orderBy: { resource: 'asc' },
    });
    expect(restricted.map((r) => r.resource)).toEqual([
      'education.evaluation',
      'finance.dues',
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

  it("gives unit_admin self_subtree reach and its first real grants — system-design.md §7.7's platform role table", async () => {
    const unitAdmin = await db.roleTemplate.findUnique({ where: { role: 'unit_admin' } });
    expect(unitAdmin?.scopeRule).toBe('self_subtree');

    const invitationResource = await db.resourceCatalog.findUnique({
      where: { resource: 'identity.invitation' },
    });
    expect(invitationResource?.allowedActions).toContain('create');

    const canInvite = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'unit_admin',
          resource: 'identity.invitation',
          action: 'create',
          condition: 'any',
        },
      },
    });
    expect(canInvite?.effect).toBe('allow');

    const canAssign = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'unit_admin',
          resource: 'identity.role_assignment',
          action: 'create',
          condition: 'any',
        },
      },
    });
    expect(canAssign?.effect).toBe('allow');
  });

  it('gives unit_admin org.unit create/update — the org tree editor (system-design.md §7.7)', async () => {
    const orgUnitResource = await db.resourceCatalog.findUnique({
      where: { resource: 'org.unit' },
    });
    expect(orgUnitResource?.allowedActions).toContain('create');
    expect(orgUnitResource?.allowedActions).toContain('update');

    for (const action of ['create', 'update'] as const) {
      const grant = await db.roleTemplateGrant.findUnique({
        where: {
          role_resource_action_condition: {
            role: 'unit_admin',
            resource: 'org.unit',
            action,
            condition: 'any',
          },
        },
      });
      expect(grant?.effect).toBe('allow');
    }
  });

  it('gives unit_admin access.unit_policy create — the unit policy override surface (FR-AUTHZ-9)', async () => {
    const policyResource = await db.resourceCatalog.findUnique({
      where: { resource: 'access.unit_policy' },
    });
    expect(policyResource?.allowedActions).toContain('create');

    const grant = await db.roleTemplateGrant.findUnique({
      where: {
        role_resource_action_condition: {
          role: 'unit_admin',
          resource: 'access.unit_policy',
          action: 'create',
          condition: 'any',
        },
      },
    });
    expect(grant?.effect).toBe('allow');
  });
});
