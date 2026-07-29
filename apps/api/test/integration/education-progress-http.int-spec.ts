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
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';

/**
 * M10: the club education roster.
 *
 * The load-bearing assertion here is the **negative** one: a plain member
 * holds `education.record: read` with condition `own`, so if this route had
 * reused that resource, one self-scoped grant would have handed over every
 * member's progress. It is gated on `education.progress` instead, which club
 * members do not hold (FR-AUTHZ-8).
 */
describe('M10: club education roster (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'g'.repeat(32);

  let clubId: string;
  let siblingClubId: string;
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
    await seedPathwayCatalog(db);

    const orgUnits = new OrgUnitRepository();
    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r12',
      name: 'Region 12',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd52',
      name: 'District 52',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c20',
      name: 'Club 20',
      timezone: 'Asia/Dhaka',
    });
    const sibling = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c21',
      name: 'Club 21',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    siblingClubId = sibling.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2039-2040',
      startsOn: new Date('2039-07-01'),
      endsOn: new Date('2040-06-30'),
    });

    const people = new PersonRepository();
    const memberships = new ClubMembershipRepository();
    const roleAssignments = new RoleAssignmentRepository();

    const vpe = await people.create({ email: 'vpe20@example.com', fullName: 'Vera Petrova' });
    const member = await people.create({ email: 'mem20@example.com', fullName: 'Ana Rahman' });
    vpeId = vpe.id;
    memberId = member.id;

    for (const [person, role] of [
      [vpe, 'club_vpe'],
      [member, 'club_member'],
    ] as const) {
      await memberships.create({ personId: person.id, clubUnitId: clubId, memberType: 'new' });
      await roleAssignments.assign({
        personId: person.id,
        orgUnitId: clubId,
        role,
        programYearId: year.id,
        termStart: new Date('2039-07-01'),
        termEnd: new Date('2040-06-30'),
        appointedBy: vpe.id,
      });
    }

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

  it('denies a plain member the club-wide roster despite their own education.record grant', async () => {
    const token = await jwtFor(memberId);
    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/education/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('denies the VPE a sibling club outside their scope', async () => {
    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .get(`/v1/clubs/${siblingClubId}/education/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lists every active member, including one who has not started a path', async () => {
    const token = await jwtFor(vpeId);
    const res = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/education/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rows = res.body as {
      personId: string;
      fullName: string;
      pathCode: string | null;
      levels: { level: number; required: number; delivered: number }[];
    }[];

    expect(rows.map((r) => r.fullName)).toEqual(['Ana Rahman', 'Vera Petrova']);
    const ana = rows.find((r) => r.personId === memberId);
    expect(ana?.pathCode).toBeNull();
    expect(ana?.levels).toHaveLength(5);
  });

  it('reports a started path with the catalogue as the denominator', async () => {
    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/education-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({ personId: memberId, pathCode: 'PM' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/education/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rows = res.body as {
      personId: string;
      pathCode: string | null;
      pathName: string | null;
      levels: { level: number; required: number; delivered: number }[];
    }[];
    const ana = rows.find((r) => r.personId === memberId);
    expect(ana?.pathName).toBe('Presentation Mastery');
    // Two level-1 projects are seeded; nothing delivered yet.
    expect(ana?.levels[0]).toMatchObject({ level: 1, required: 2, delivered: 0 });
  });
});
