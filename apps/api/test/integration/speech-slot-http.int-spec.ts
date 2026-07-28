import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
import { seedAccessVocabulary, seedPathwayCatalog } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { MeetingRepository } from '../../src/modules/meeting/meeting.repository';

/** M3 Slice 4: speech-slot request/approval with path validation. */
describe('M3 Slice 4: speech slots (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let clubBId: string;
  let programYearId: string;
  let meetingId: string;
  let vpeId: string;
  let memberId: string;
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
    await seedPathwayCatalog(db);

    const orgUnits = new OrgUnitRepository();
    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r3',
      name: 'Region 3',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd43',
      name: 'District 43',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c5',
      name: 'Club 5',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c6',
      name: 'Club 6',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubBId = clubB.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2028-2029',
      startsOn: new Date('2028-07-01'),
      endsOn: new Date('2029-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe3@example.com', fullName: 'VPE Three' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2028-07-01'),
      termEnd: new Date('2029-06-30'),
      appointedBy: vpe.id,
    });

    const member = await people.create({ email: 'member3@example.com', fullName: 'Member Three' });
    memberId = member.id;
    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: clubId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2028-07-01'),
      termEnd: new Date('2029-06-30'),
      appointedBy: vpe.id,
    });

    const outsider = await people.create({
      email: 'outsider3@example.com',
      fullName: 'Outsider Three',
    });
    outsiderId = outsider.id;
    await roleAssignments.assign({
      personId: outsider.id,
      orgUnitId: clubBId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2028-07-01'),
      termEnd: new Date('2029-06-30'),
      appointedBy: outsider.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2028-08-01T18:00:00Z'),
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

  it('a member requests a valid Ice Breaker slot; level is derived server-side; a VPE approves it', async () => {
    const memberToken = await jwtFor(memberId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}/speech-slots`;

    const created = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'My Ice Breaker',
        pathCode: 'PM',
        projectCode: 'PM-ICE-BREAKER',
        plannedDurationSeconds: 300,
      })
      .expect(201);
    expect(created.body).toMatchObject({ level: 1, status: 'requested' });

    const vpeToken = await jwtFor(vpeId);
    const decided = await request(app.getHttpServer())
      .patch(`${base}/${created.body.id}`)
      .set('Authorization', `Bearer ${vpeToken}`)
      .send({ status: 'approved' })
      .expect(200);
    expect(decided.body.status).toBe('approved');
  });

  it('a duration outside the project bounds is rejected', async () => {
    const memberToken = await jwtFor(memberId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/speech-slots`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Too long',
        pathCode: 'PM',
        projectCode: 'PM-ICE-BREAKER',
        plannedDurationSeconds: 3600,
      })
      .expect(400);
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const outsiderToken = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/speech-slots`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        title: 'Intrusion',
        pathCode: 'PM',
        projectCode: 'PM-ICE-BREAKER',
        plannedDurationSeconds: 300,
      })
      .expect(403);
  });
});
