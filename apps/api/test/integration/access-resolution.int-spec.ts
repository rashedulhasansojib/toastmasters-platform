import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('Access resolution (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;

  let clubAPath: string;
  let clubBPath: string;
  let clubAId: string;
  let clubCId: string;
  let clubCPath: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);
    authz = new AuthzService(new AccessRepository(db));

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
    const clubA = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cA',
      name: 'Club A',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cB',
      name: 'Club B',
      timezone: 'Asia/Dhaka',
    });
    const clubC = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cC',
      name: 'Club C',
      timezone: 'Asia/Dhaka',
    });
    clubAId = clubA.id;
    clubAPath = clubA.path;
    clubBPath = clubB.path;
    clubCId = clubC.id;
    clubCPath = clubC.path;

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

  it('club_treasurer reads their own club ledger but not a sibling club ledger', async () => {
    const treasurer = await people.create({
      email: 'treasurer@example.com',
      fullName: 'Treasurer One',
    });
    await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: clubAId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });
    const principal = { userId: treasurer.id, roles: [], scopes: [] };

    const ownClub = await authz.authorize({
      principal,
      resource: 'finance.ledger',
      action: 'read',
      scope: clubAPath,
    });
    expect(ownClub.allowed).toBe(true);

    const siblingClub = await authz.authorize({
      principal,
      resource: 'finance.ledger',
      action: 'read',
      scope: clubBPath,
    });
    expect(siblingClub.allowed).toBe(false);
  });

  it('an ended assignment grants nothing', async () => {
    const treasurer = await people.create({
      email: 'ended-treasurer@example.com',
      fullName: 'Ended Treasurer',
    });
    const assignment = await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: clubCId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });
    await roleAssignments.end(assignment.id, 'resigned');

    const decision = await authz.authorize({
      principal: { userId: treasurer.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read',
      scope: clubCPath,
    });
    expect(decision).toEqual({ allowed: false, reason: 'default-deny' });
  });
});
