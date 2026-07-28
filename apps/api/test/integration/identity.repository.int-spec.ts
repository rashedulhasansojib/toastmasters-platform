import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';

describe('Identity repositories (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let orgUnits: OrgUnitRepository;
  let programYears: ProgramYearRepository;
  let people: PersonRepository;
  let clubMemberships: ClubMembershipRepository;
  let roleAssignments: RoleAssignmentRepository;

  let clubId: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    orgUnits = new OrgUnitRepository(db);
    programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    clubMemberships = new ClubMembershipRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);

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
      code: 'c1234',
      name: 'Club 1234',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

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

  describe('PersonRepository', () => {
    it('creates a person with a lowercased, unique email', async () => {
      const created = await people.create({ email: 'Karim@Example.com', fullName: 'Karim Rahman' });
      expect(created.email).toBe('karim@example.com');
      expect(created.status).toBe('invited');

      const found = await people.findByEmail('karim@EXAMPLE.com');
      expect(found?.id).toBe(created.id);
    });

    it('rejects a duplicate email at the database', async () => {
      await people.create({ email: 'dupe@example.com', fullName: 'First' });
      await expect(
        people.create({ email: 'dupe@example.com', fullName: 'Second' }),
      ).rejects.toThrow();
    });
  });

  describe('ClubMembershipRepository', () => {
    it('allows only one primary membership per person', async () => {
      const p = await people.create({ email: 'primary@example.com', fullName: 'Primary Person' });
      const first = await clubMemberships.create({
        personId: p.id,
        clubUnitId: clubId,
        memberType: 'new',
        isPrimary: true,
      });
      expect(first.isPrimary).toBe(true);

      const district = await orgUnits.findByPath('r1.d41');
      const secondClub = await orgUnits.createChild({
        parentId: district!.id,
        type: 'club',
        code: 'c5678',
        name: 'Club 5678',
        timezone: 'Asia/Dhaka',
      });

      await expect(
        clubMemberships.create({
          personId: p.id,
          clubUnitId: secondClub.id,
          memberType: 'dual',
          isPrimary: true,
        }),
      ).rejects.toThrow();
    });
  });

  describe('RoleAssignmentRepository', () => {
    it('assigns an active role and rejects a second active one for the same unit/role/year', async () => {
      const president = await people.create({
        email: 'president@example.com',
        fullName: 'President One',
      });
      const challenger = await people.create({
        email: 'challenger@example.com',
        fullName: 'Challenger Two',
      });

      const assignment = await roleAssignments.assign({
        personId: president.id,
        orgUnitId: clubId,
        role: 'club_president',
        programYearId,
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
        appointedBy: president.id,
      });
      expect(assignment.status).toBe('active');

      await expect(
        roleAssignments.assign({
          personId: challenger.id,
          orgUnitId: clubId,
          role: 'club_president',
          programYearId,
          termStart: new Date('2026-07-01'),
          termEnd: new Date('2027-06-30'),
          appointedBy: president.id,
        }),
      ).rejects.toThrow();
    });

    it('retains an ended assignment with status="ended" rather than deleting it', async () => {
      const p = await people.create({ email: 'vpe@example.com', fullName: 'VPE Person' });
      const assignment = await roleAssignments.assign({
        personId: p.id,
        orgUnitId: clubId,
        role: 'club_vpe',
        programYearId,
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
        appointedBy: p.id,
      });

      await roleAssignments.end(assignment.id, 'resigned');

      const found = await roleAssignments.findById(assignment.id);
      expect(found?.status).toBe('ended');
      expect(found?.endedReason).toBe('resigned');

      const active = await roleAssignments.findActiveForUnit(clubId, 'club_vpe');
      expect(active).toHaveLength(0);
    });
  });
});
