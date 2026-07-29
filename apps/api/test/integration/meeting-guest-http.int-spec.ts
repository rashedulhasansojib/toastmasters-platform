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

/** M9 Slice 2: meeting Guest List. */
describe('M9 Slice 2: meeting guest list (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let clubBId: string;
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

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe@example.com', fullName: 'VPE' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId: year.id,
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
      programYearId: year.id,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: outsider.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId: year.id,
      scheduledAt: new Date('2026-08-01T18:00:00Z'),
      createdBy: vpe.id,
    });
    meetingId = meeting.id;
    const meetingB = await meetings.create({
      clubUnitId: clubBId,
      programYearId: year.id,
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

  it('a club_vpe adds a manual guest; GET returns it; PATCH toggles present; DELETE removes it', async () => {
    const token = await jwtFor(vpeId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}/guests`;

    const created = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Alex Guest', email: 'alex@example.com', phone: '+8801234' })
      .expect(201);
    expect(created.body.fullName).toBe('Alex Guest');
    expect(created.body.present).toBe(true);
    expect(created.body.guestId).toBeNull();
    const guestId = created.body.id;

    const list = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(guestId);

    const patched = await request(app.getHttpServer())
      .patch(`${base}/${guestId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ present: false, notes: 'ran late, no-show' })
      .expect(200);
    expect(patched.body.present).toBe(false);
    expect(patched.body.notes).toBe('ran late, no-show');

    await request(app.getHttpServer())
      .delete(`${base}/${guestId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const empty = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(empty.body).toEqual([]);
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const token = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Attempted intrusion' })
      .expect(403);
  });

  it('a meeting id that belongs to a different club under the given clubUnitId 404s', async () => {
    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/meetings/${meetingInOtherClubId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
