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

/** M3 Slice 6: the guest capability-token primitive. */
describe('M3 Slice 6: capability tokens (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let programYearId: string;
  let meetingId: string;
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
      code: 'r5',
      name: 'Region 5',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd45',
      name: 'District 45',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c9',
      name: 'Club 9',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c10',
      name: 'Club 10',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2030-2031',
      startsOn: new Date('2030-07-01'),
      endsOn: new Date('2031-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe5@example.com', fullName: 'VPE Five' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2030-07-01'),
      termEnd: new Date('2031-06-30'),
      appointedBy: vpe.id,
    });

    const outsider = await people.create({
      email: 'outsider5@example.com',
      fullName: 'Outsider Five',
    });
    outsiderId = outsider.id;
    await roleAssignments.assign({
      personId: outsider.id,
      orgUnitId: clubB.id,
      role: 'club_member',
      programYearId,
      termStart: new Date('2030-07-01'),
      termEnd: new Date('2031-06-30'),
      appointedBy: outsider.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2030-08-01T18:00:00Z'),
      createdBy: vpe.id,
    });
    meetingId = meeting.id;

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

  it('a club_vpe issues a token; a guest verifies it with no auth; revoking it invalidates it', async () => {
    const token = await jwtFor(vpeId);
    const issued = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/capability-tokens`)
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'guest_ballot' })
      .expect(201);
    expect(issued.body.token).toBeTruthy();
    expect(issued.body.meetingId).toBe(meetingId);

    const verified = await request(app.getHttpServer())
      .post('/v1/capability-tokens/verify')
      .send({ token: issued.body.token })
      .expect(200);
    expect(verified.body).toEqual({ valid: true, meetingId, purpose: 'guest_ballot' });

    await request(app.getHttpServer())
      .patch(`/v1/clubs/${clubId}/meetings/${meetingId}/capability-tokens/${issued.body.id}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const afterRevoke = await request(app.getHttpServer())
      .post('/v1/capability-tokens/verify')
      .send({ token: issued.body.token })
      .expect(200);
    expect(afterRevoke.body.valid).toBe(false);
  });

  it('an unknown token verifies as invalid, with no clue as to why', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/capability-tokens/verify')
      .send({ token: 'not-a-real-token' })
      .expect(200);
    expect(res.body).toEqual({ valid: false, meetingId: null, purpose: null });
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const token = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/capability-tokens`)
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'guest_ballot' })
      .expect(403);
  });
});
