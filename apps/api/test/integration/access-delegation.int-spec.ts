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

    // The canDelegate check must run before any write — a rejected escalation
    // leaves no audit trail behind it, as if it never touched the database.
    const event = await db.auditEvent.findFirst({
      where: { type: 'person_grant_created', actorPersonId: president.id },
    });
    expect(event).toBeNull();
  });

  it('grantPersonGrant() writes a person_grant_created audit event on success', async () => {
    // A fresh club — role_assignment_singleton means clubId already has a
    // club_president from the escalation test above.
    const orgUnits = new OrgUnitRepository(db);
    const club = await orgUnits.createChild({
      parentId: districtId,
      type: 'club',
      code: 'c-audit-grant',
      name: 'Club Audit Grant',
      timezone: 'Asia/Dhaka',
    });
    const president = await people.create({
      email: 'president-audit@example.com',
      fullName: 'Audit President',
    });
    await roleAssignments.assign({
      personId: president.id,
      orgUnitId: club.id,
      role: 'club_president',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: president.id,
    });
    const recipient = await people.create({
      email: 'grant-recipient@example.com',
      fullName: 'Grant Recipient',
    });

    await grantAdmin.grantPersonGrant({
      actorId: president.id,
      personId: recipient.id,
      orgUnitId: club.id,
      resource: 'identity.role_assignment', // club_president holds :create itself
      action: 'create',
      reason: 'covering for the VPE this term',
    });

    const event = await db.auditEvent.findFirst({
      where: { type: 'person_grant_created', actorPersonId: president.id, orgUnitId: club.id },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event).toBeTruthy();
    expect(event?.resource).toBe('identity.role_assignment');
    expect(event?.action).toBe('create');
    expect(event?.reason).toBe('covering for the VPE this term');
    expect(event?.metadata).toMatchObject({ personId: recipient.id });
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
    const grantEvent = await db.auditEvent.findFirst({
      where: { type: 'platform_role_granted', actorPersonId: admin1.id, orgUnitId: clubId },
    });
    expect(grantEvent).toBeTruthy();
    expect(grantEvent?.metadata).toMatchObject({ personId: admin1.id, role: 'unit_admin' });

    await expect(grantAdmin.revokePlatformRole(a1.id, admin1.id)).rejects.toThrow();
    // The last-admin guard runs before any write — the rejected revoke
    // leaves no audit trail.
    const rejectedRevokeEvent = await db.auditEvent.findFirst({
      where: { type: 'platform_role_revoked', actorPersonId: admin1.id },
    });
    expect(rejectedRevokeEvent).toBeNull();

    const a2 = await grantAdmin.grantPlatformRole({
      personId: admin2.id,
      role: 'unit_admin',
      orgUnitId: clubId,
      grantedBy: admin1.id,
    });
    await expect(grantAdmin.revokePlatformRole(a1.id, admin1.id)).resolves.not.toThrow();
    const revokeEvent = await db.auditEvent.findFirst({
      where: { type: 'platform_role_revoked', actorPersonId: admin1.id, orgUnitId: clubId },
    });
    expect(revokeEvent).toBeTruthy();
    expect(revokeEvent?.metadata).toMatchObject({ personId: admin1.id, role: 'unit_admin' });

    // a2 is now the last one — removing it should fail in turn.
    await expect(grantAdmin.revokePlatformRole(a2.id, admin1.id)).rejects.toThrow();
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

  it('createUnitPolicyGrant accepts an expiresAt and returns a mapped shape with no raw Prisma internals', async () => {
    const creator = await people.create({
      email: 'policy-creator@example.com',
      fullName: 'Creator',
    });
    const expiresAt = new Date('2026-12-31T00:00:00.000Z');

    const withExpiry = await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubId,
      subjectRole: 'club_member',
      resource: 'meeting.role',
      action: 'update',
      effect: 'allow',
      createdBy: creator.id,
      reason: 'temporary agenda-editing access',
      expiresAt,
    });
    expect(withExpiry.expiresAt).toBe(expiresAt.toISOString());
    expect(withExpiry.orgUnitId).toBe(clubId);
    expect(withExpiry.createdAt).toEqual(expect.any(String));
    expect((withExpiry as unknown as { org_unit_id?: string }).org_unit_id).toBeUndefined();

    const event = await db.auditEvent.findFirst({
      where: {
        type: 'unit_policy_grant_created',
        actorPersonId: creator.id,
        orgUnitId: clubId,
        resource: 'meeting.role',
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event).toBeTruthy();
    expect(event?.action).toBe('update');
    expect(event?.reason).toBe('temporary agenda-editing access');
    expect(event?.metadata).toMatchObject({ subjectRole: 'club_member', effect: 'allow' });

    const withoutExpiry = await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubId,
      subjectRole: 'club_member',
      resource: 'meeting.role',
      action: 'update',
      effect: 'allow',
      createdBy: creator.id,
      reason: 'standing agenda-editing access',
    });
    expect(withoutExpiry.expiresAt).toBeNull();
  });

  it('findPlatformRoleOrgUnitIdsForPerson excludes org-unit-less platform roles', async () => {
    const person = await people.create({
      email: 'platform-switcher@example.com',
      fullName: 'Platform Switcher',
    });
    await grantAdmin.grantPlatformRole({
      personId: person.id,
      role: 'unit_admin',
      orgUnitId: clubId,
      grantedBy: person.id,
    });
    await grantAdmin.grantPlatformRole({
      personId: person.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: person.id,
    });

    const unitIds = await grantAdmin.findPlatformRoleOrgUnitIdsForPerson(person.id);
    expect(unitIds).toEqual([clubId]);
  });
});
