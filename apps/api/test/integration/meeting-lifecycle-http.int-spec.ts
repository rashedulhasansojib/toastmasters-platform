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

/** M3 Slice 11: meeting lifecycle + guarded close-out (system-design.md §9.5). */
describe('M3 Slice 11: meeting lifecycle (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let programYearId: string;
  let vpeId: string;
  let memberId: string;

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
      code: 'r10',
      name: 'Region 10',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd50',
      name: 'District 50',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c17',
      name: 'Club 17',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2036-2037',
      startsOn: new Date('2036-07-01'),
      endsOn: new Date('2037-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe10@example.com', fullName: 'VPE Ten' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2036-07-01'),
      termEnd: new Date('2037-06-30'),
      appointedBy: vpe.id,
    });
    const member = await people.create({ email: 'member10@example.com', fullName: 'Member Ten' });
    memberId = member.id;

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

  async function createMeeting() {
    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2036-08-01T18:00:00Z'),
      createdBy: vpeId,
    });
    return meeting.id;
  }

  it('draft → published → in_progress → closed; a confirmed role becomes fulfilled on close', async () => {
    const token = await jwtFor(vpeId);
    const meetingId = await createMeeting();
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}`;

    await request(app.getHttpServer())
      .post(`${base}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const role = await request(app.getHttpServer())
      .post(`${base}/role-assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleKey: 'timer', assignee: { kind: 'member', personId: memberId } })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`${base}/role-assignments/${role.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' })
      .expect(200);

    const closed = await request(app.getHttpServer())
      .post(`${base}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(closed.body.status).toBe('closed');

    const roles = await request(app.getHttpServer())
      .get(`${base}/role-assignments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(roles.body[0].status).toBe('fulfilled');
    expect(roles.body[0].fulfilledAt).not.toBeNull();
  });

  it('close is guarded — a proposed role assignment blocks it', async () => {
    const token = await jwtFor(vpeId);
    const meetingId = await createMeeting();
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}`;

    await request(app.getHttpServer())
      .post(`${base}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/role-assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleKey: 'grammarian', assignee: { kind: 'unfilled' } })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${base}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('an out-of-order transition is rejected (cannot start a draft meeting)', async () => {
    const token = await jwtFor(vpeId);
    const meetingId = await createMeeting();
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
