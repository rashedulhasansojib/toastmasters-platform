import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { MeetingRepository } from '../../src/modules/meeting/meeting.repository';

describe('MeetingRepository (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let meetings: MeetingRepository;
  let clubAId: string;
  let clubBId: string;
  let programYearId: string;
  let creatorId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    meetings = new MeetingRepository(db);

    const orgUnits = new OrgUnitRepository(db);
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
    clubAId = clubA.id;
    clubBId = clubB.id;

    const programYears = new ProgramYearRepository(db);
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository(db);
    const creator = await people.create({ email: 'vpe@example.com', fullName: 'VPE Person' });
    creatorId = creator.id;
  });
  afterAll(async () => {
    await stop();
  });

  it('creates a meeting scoped to its club and finds it by id', async () => {
    const created = await meetings.create({
      clubUnitId: clubAId,
      programYearId,
      scheduledAt: new Date('2026-08-01T18:00:00Z'),
      createdBy: creatorId,
    });
    expect(created.clubUnitId).toBe(clubAId);

    const found = await meetings.findById(created.id);
    expect(found?.id).toBe(created.id);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await meetings.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('findByClub returns only that club’s meetings, never a sibling club’s', async () => {
    const meetingA = await meetings.create({
      clubUnitId: clubAId,
      programYearId,
      scheduledAt: new Date('2026-08-08T18:00:00Z'),
      createdBy: creatorId,
    });
    await meetings.create({
      clubUnitId: clubBId,
      programYearId,
      scheduledAt: new Date('2026-08-09T18:00:00Z'),
      createdBy: creatorId,
    });

    const clubAMeetings = await meetings.findByClub(clubAId);
    expect(clubAMeetings.map((m) => m.id)).toContain(meetingA.id);
    expect(clubAMeetings.every((m) => m.clubUnitId === clubAId)).toBe(true);
  });
});
