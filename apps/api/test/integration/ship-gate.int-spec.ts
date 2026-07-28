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

/**
 * The M1 ship gate (roadmap.md line 149 / prd.md FR-ACC-8): "A President
 * creates a meeting and assigns a VPE; a member of another club cannot see
 * it — the denial is a query-level 403/404, not a filtered-after-fetch."
 * Real Postgres + Redis, the real AppModule, real HTTP routes — nothing
 * about this test calls authorize() or a repository directly.
 */
describe('M1 ship gate: President assigns VPE, VPE creates a meeting (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'c'.repeat(32);

  let clubAId: string;
  let presidentId: string;
  let karimId: string;
  let clubBMemberId: string;
  let programYearId: string;

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
    await db.$disconnect(); // this suite talks to the DB only through getPrisma()'s own singleton from here on

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

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();

    // Bootstrapping the first officer isn't the thing under test — every
    // prior slice's integration tests seed role holders directly the same way.
    const president = await people.create({
      email: 'president@example.com',
      fullName: 'Club President',
    });
    presidentId = president.id;
    await roleAssignments.assign({
      personId: president.id,
      orgUnitId: clubAId,
      role: 'club_president',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: president.id,
    });

    const karim = await people.create({ email: 'karim@example.com', fullName: 'Karim Hossain' });
    karimId = karim.id;

    const clubBMember = await people.create({
      email: 'clubb-member@example.com',
      fullName: 'Club B Member',
    });
    clubBMemberId = clubBMember.id;
    await roleAssignments.assign({
      personId: clubBMember.id,
      orgUnitId: clubB.id,
      role: 'club_member',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: clubBMember.id,
    });

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

  it('walks the whole ship gate end to end', async () => {
    // 1. President assigns Karim as VPE.
    const presidentToken = await jwtFor(presidentId);
    const assignRes = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubAId}/role-assignments`)
      .set('Authorization', `Bearer ${presidentToken}`)
      .send({
        personId: karimId,
        role: 'club_vpe',
        programYearId,
        termStart: '2026-07-01',
        termEnd: '2027-06-30',
      })
      .expect(201);
    expect(assignRes.body.role).toBe('club_vpe');
    expect(assignRes.body.status).toBe('active');

    // 2. Karim, now VPE, creates a meeting.
    const karimToken = await jwtFor(karimId);
    const meetingRes = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubAId}/meetings`)
      .set('Authorization', `Bearer ${karimToken}`)
      .send({ programYearId, scheduledAt: '2026-08-01T18:00:00.000Z' })
      .expect(201);
    const meetingId = meetingRes.body.id as string;
    expect(meetingRes.body.clubUnitId).toBe(clubAId);

    // 3. Karim can read the meeting he just created.
    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubAId}/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${karimToken}`)
      .expect(200);

    // 4. A Club B member cannot see it — query-level denial, zero meeting
    //    rows ever read for this request (the guard denies before the
    //    controller/repository runs at all).
    const clubBToken = await jwtFor(clubBMemberId);
    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubAId}/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${clubBToken}`)
      .expect(403);

    // 5. Same denial on the list endpoint — the FR-AUTHZ-8 case rbac-design.md
    //    §4.3 warns about (fetch-then-discard instead of a scoped query).
    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubAId}/meetings`)
      .set('Authorization', `Bearer ${clubBToken}`)
      .expect(403);

    // 6. Karim's own list is scoped correctly — exactly the one meeting.
    const listRes = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubAId}/meetings`)
      .set('Authorization', `Bearer ${karimToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(meetingId);
  });

  it('a Club B member cannot appoint an officer at Club A either', async () => {
    const clubBToken = await jwtFor(clubBMemberId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubAId}/role-assignments`)
      .set('Authorization', `Bearer ${clubBToken}`)
      .send({
        personId: clubBMemberId,
        role: 'club_vpe',
        programYearId,
        termStart: '2026-07-01',
        termEnd: '2027-06-30',
      })
      .expect(403);
  });
});
