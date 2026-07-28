import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('system_admin break-glass and direct-grant expiry (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let grantAdmin: GrantAdminRepository;

  let clubId: string;
  let clubPath: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    people = new PersonRepository(db);
    const access = new AccessRepository(db);
    grantAdmin = new GrantAdminRepository(db, access);
    authz = new AuthzService(access);

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1',
      name: 'Club 1',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubPath = club.path;
  });
  afterAll(async () => {
    await stop();
  });

  it('grants system_admin broad access to a non-restricted resource with no explicit template grant', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin@example.com',
      fullName: 'System Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });

    const decision = await authz.authorize({
      principal: { userId: sysAdmin.id, roles: [], scopes: [] },
      resource: 'meeting.meeting',
      action: 'read',
      scope: clubPath,
    });
    expect(decision.allowed).toBe(true);
  });

  it('denies system_admin a restricted read until it mints break-glass, then allows and audits it', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin2@example.com',
      fullName: 'System Admin Two',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });
    const request = {
      principal: { userId: sysAdmin.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read' as const,
      scope: clubPath,
    };

    const before = await authz.authorize(request);
    expect(before.allowed).toBe(false); // restricted — excluded from the broad synthesis

    await grantAdmin.mintBreakGlass({
      systemAdminPersonId: sysAdmin.id,
      orgUnitId: clubId,
      resource: 'finance.ledger',
      action: 'read',
      reason: 'investigating a member-reported discrepancy',
    });

    const after = await authz.authorize(request);
    expect(after.allowed).toBe(true);

    // M2 Slice 5: grantPlatformRole() now also audits itself, so sysAdmin's
    // own platform-role grant above appears alongside the break-glass mint
    // and the restricted read it enabled.
    const events = await db.auditEvent.findMany({ where: { actorPersonId: sysAdmin.id } });
    expect(events.map((e) => e.type).sort()).toEqual([
      'break_glass_mint',
      'platform_role_granted',
      'restricted_read',
    ]);
  });

  it('treats an expired direct grant as inert', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin3@example.com',
      fullName: 'System Admin Three',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });
    await grantAdmin.mintBreakGlass({
      systemAdminPersonId: sysAdmin.id,
      orgUnitId: clubId,
      resource: 'finance.ledger',
      action: 'read',
      reason: 'already expired, for this test',
      expiresAt: new Date(Date.now() - 1000), // already in the past
    });

    const decision = await authz.authorize({
      principal: { userId: sysAdmin.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read',
      scope: clubPath,
    });
    expect(decision.allowed).toBe(false);
  });
});
