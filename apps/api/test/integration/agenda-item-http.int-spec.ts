import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { MeetingRepository } from '../../src/modules/meeting/meeting.repository';

/** M3 Slice 1: the agenda builder. */
describe('M3 Slice 1: agenda builder (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let clubBId: string;
  let programYearId: string;
  let meetingId: string;
  let meetingInOtherClubId: string;
  let vpeId: string;
  let outsiderId: string;

  const jwtFor = (personId: string) =>
    new SignJWT({ roles: [], scopes: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(personId)
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret));

  beforeAll(async () => {
    const { db, url: dbUrl, stop: stopDbContainer } = await startTestDb();
    const { url: redisUrl, stop: stopRedisContainer } = await startTestRedis();
    stopDb = stopDbContainer;
    stopRedis = stopRedisContainer;

    process.env.DATABASE_URL = dbUrl;
    process.env.DIRECT_URL = dbUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.SESSION_JWT_SECRET = secret;
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository();
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
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c2',
      name: 'Club 2',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubBId = clubB.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe@example.com', fullName: 'VPE' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: vpe.id,
    });

    const outsider = await people.create({
      email: 'outsider@example.com',
      fullName: 'Outsider',
    });
    outsiderId = outsider.id;
    await roleAssignments.assign({
      personId: outsider.id,
      orgUnitId: clubBId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: outsider.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2026-08-01T18:00:00Z'),
      createdBy: vpe.id,
    });
    meetingId = meeting.id;
    const meetingB = await meetings.create({
      clubUnitId: clubBId,
      programYearId,
      scheduledAt: new Date('2026-08-01T18:00:00Z'),
      createdBy: outsider.id,
    });
    meetingInOtherClubId = meetingB.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopDb();
    await stopRedis();
  });

  it('a club_vpe builds an agenda; positions auto-increment and GET returns them in order', async () => {
    const token = await jwtFor(vpeId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}/agenda-items`;

    for (const title of ['Word of the Day', 'Table Topics', 'Prepared Speeches']) {
      await request(app.getHttpServer())
        .post(base)
        .set('Authorization', `Bearer ${token}`)
        .send({ title, plannedDurationSeconds: 300 })
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.map((i: { title: string; position: number }) => [i.position, i.title])).toEqual(
      [
        [1, 'Word of the Day'],
        [2, 'Table Topics'],
        [3, 'Prepared Speeches'],
      ],
    );
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const token = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/agenda-items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Attempted intrusion', plannedDurationSeconds: 60 })
      .expect(403);
  });

  it('a meeting id that belongs to a different club under the given clubUnitId 404s', async () => {
    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/meetings/${meetingInOtherClubId}/agenda-items`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
