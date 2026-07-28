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
import { AccessInspectorRepository } from '../../src/modules/access/access-inspector.repository';

describe('Access inspector (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;
  let grantAdmin: GrantAdminRepository;
  let inspector: AccessInspectorRepository;

  let clubId: string;
  let clubPath: string;
  let clubBId: string;
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
    inspector = new AccessInspectorRepository(db, access);

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

    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c2',
      name: 'Club 2',
      timezone: 'Asia/Dhaka',
    });
    clubBId = clubB.id;

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

  it('explainAccess attributes a deny-beats-allow decision to the unit policy that decided it', async () => {
    const saa = await people.create({ email: 'saa@example.com', fullName: 'Sergeant at Arms' });
    await roleAssignments.assign({
      personId: saa.id,
      orgUnitId: clubId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: saa.id,
    });
    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubId,
      subjectRole: 'club_member',
      resource: 'meeting.meeting',
      action: 'read',
      effect: 'deny',
      createdBy: saa.id,
      reason: 'club policy: agenda is officers-only this term',
    });

    const { personLabel, result, text } = await inspector.explainAccess({
      personId: saa.id,
      resource: 'meeting.meeting',
      action: 'read',
      scope: clubPath,
    });

    expect(personLabel).toBe('Sergeant at Arms');
    expect(result.decision.allowed).toBe(false);
    expect(result.matchedGrant?.source).toEqual({ kind: 'unit_policy', orgUnitId: clubId });
    expect(text).toContain('✗ DENY');
  });

  it('whatCanDoAt lists only what the person can actually do at that unit, not their whole catalog', async () => {
    const treasurer = await people.create({
      email: 'treasurer2@example.com',
      fullName: 'Treasurer Two',
    });
    await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: clubId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });

    const capabilities = await inspector.whatCanDoAt(treasurer.id, clubPath);
    expect(capabilities).toContainEqual({
      resource: 'finance.ledger',
      action: 'read',
      condition: 'any',
    });
    expect(capabilities).toContainEqual({
      resource: 'finance.ledger',
      action: 'create',
      condition: 'any',
    });
    expect(
      capabilities.find((c) => c.resource === 'identity.role_assignment' && c.action === 'create'),
    ).toBeUndefined(); // that's club_president's grant, not club_treasurer's
  });

  it('whoCanAccess enumerates holders across role, platform, unit-policy and direct sources', async () => {
    const treasurer = await people.create({
      email: 'treasurer3@example.com',
      fullName: 'Treasurer Three',
    });
    await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: clubBId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });

    const sysAdmin = await people.create({
      email: 'sysadmin-inspector@example.com',
      fullName: 'Sys Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });

    const holders = await inspector.whoCanAccess('finance.ledger', 'read');
    const byPerson = new Map(holders.map((h) => [h.personId, h]));

    expect(byPerson.get(treasurer.id)?.via).toBe('role:club_treasurer');
    expect(byPerson.get(treasurer.id)?.fullName).toBe('Treasurer Three');
    // finance.ledger is non-restricted in the seeded catalog? No — it's
    // restricted, so system_admin's broad synthesis excludes it. Assert the
    // exclusion explicitly: this is the break-glass divergence (Slice 6),
    // proven again here from the reverse-query side.
    expect(byPerson.has(sysAdmin.id)).toBe(false);
  });

  it('whoCanAccess includes a break-glass direct grant and a unit-policy role override', async () => {
    const sysAdmin = await people.create({
      email: 'sysadmin-bg@example.com',
      fullName: 'Break Glass Admin',
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
      reason: 'investigating a discrepancy',
    });

    const member = await people.create({
      email: 'member-policy@example.com',
      fullName: 'Policy Member',
    });
    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: clubBId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: member.id,
    });
    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubBId,
      subjectRole: 'club_member',
      resource: 'finance.ledger',
      action: 'read',
      effect: 'allow',
      createdBy: member.id,
      reason: 'club voted to open the books this term',
    });

    const holders = await inspector.whoCanAccess('finance.ledger', 'read');
    expect(holders.some((h) => h.personId === sysAdmin.id && h.via === 'direct')).toBe(true);
    // member also holds finance.ledger:read (own) via club_member's own
    // template grant — assert the unit-policy entry exists alongside it,
    // not that it's the only one.
    expect(holders.some((h) => h.personId === member.id && h.via === 'unit_policy')).toBe(true);
  });
});
