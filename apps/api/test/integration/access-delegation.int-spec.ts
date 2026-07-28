import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('Delegation and unit-policy overrides (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;
  let grantAdmin: GrantAdminRepository;

  let districtId: string;
  let clubId: string;
  let clubPath: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);
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
    districtId = district.id;
    clubId = club.id;
    clubPath = club.path;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;
  });
  afterAll(async () => {
    await stop();
  });

  it('blocks a President from delegating a grant they do not hold (escalation via invitation)', async () => {
    const president = await people.create({
      email: 'president@example.com',
      fullName: 'President',
    });
    await roleAssignments.assign({
      personId: president.id,
      orgUnitId: clubId,
      role: 'club_president',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: president.id,
    });
    const nobody = await people.create({ email: 'nobody@example.com', fullName: 'Nobody Yet' });

    // The President's grants are all club-scoped; platform.audit at the
    // district is not among them — matches rbac-design.md §12's worked
    // example exactly.
    await expect(
      grantAdmin.grantPersonGrant({
        actorId: president.id,
        personId: nobody.id,
        orgUnitId: districtId,
        resource: 'platform.audit',
        action: 'read',
        reason: 'attempted escalation',
      }),
    ).rejects.toThrow();
  });

  it('refuses to remove the last unit_admin for a unit, but allows it when another remains', async () => {
    const admin1 = await people.create({ email: 'admin1@example.com', fullName: 'Admin One' });
    const admin2 = await people.create({ email: 'admin2@example.com', fullName: 'Admin Two' });

    const a1 = await grantAdmin.grantPlatformRole({
      personId: admin1.id,
      role: 'unit_admin',
      orgUnitId: clubId,
      grantedBy: admin1.id,
    });
    await expect(grantAdmin.revokePlatformRole(a1.id)).rejects.toThrow();

    const a2 = await grantAdmin.grantPlatformRole({
      personId: admin2.id,
      role: 'unit_admin',
      orgUnitId: clubId,
      grantedBy: admin1.id,
    });
    await expect(grantAdmin.revokePlatformRole(a1.id)).resolves.not.toThrow();
    // a2 is now the last one — removing it should fail in turn.
    await expect(grantAdmin.revokePlatformRole(a2.id)).rejects.toThrow();
  });

  it('a unit-policy deny beats a role-template allow (rbac-design.md §12)', async () => {
    const saa = await people.create({ email: 'saa@example.com', fullName: 'Sergeant at Arms' });
    await roleAssignments.assign({
      personId: saa.id,
      orgUnitId: clubId,
      role: 'club_member', // seeded with meeting.meeting:read — see Slice 3
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: saa.id,
    });
    const request = {
      principal: { userId: saa.id, roles: [], scopes: [] },
      resource: 'meeting.meeting',
      action: 'read' as const,
      scope: clubPath,
    };

    const before = await authz.authorize(request);
    expect(before.allowed).toBe(true);

    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubId,
      subjectRole: 'club_member',
      resource: 'meeting.meeting',
      action: 'read',
      effect: 'deny',
      createdBy: saa.id,
      reason: 'club policy: agenda is officers-only this term',
    });

    const after = await authz.authorize(request);
    expect(after.allowed).toBe(false);
  });
});
