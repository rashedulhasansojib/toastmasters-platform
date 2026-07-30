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
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';

/** FR-MTG-5: the planner is a projection over role assignments, and import never guesses a name. */
describe('Meeting planner (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  let clubId: string;
  let otherClubId: string;
  let vpeId: string;
  let outsiderId: string;
  let rahimA: string;

  const SEPT = '2026-09-01T11:00:00.000Z';

  const secret = 'planner-int-spec-secret-planner-int-spec-secret';

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

    const units = new OrgUnitRepository();
    const region = await units.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'UTC',
    });
    const district = await units.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'UTC',
    });
    const club = await units.createChild({
      parentId: district.id,
      type: 'club',
      code: 'pc',
      name: 'Planner Club',
      timezone: 'UTC',
    });
    clubId = club.id;
    const otherClub = await units.createChild({
      parentId: district.id,
      type: 'club',
      code: 'oc',
      name: 'Other Club',
      timezone: 'UTC',
    });
    otherClubId = otherClub.id;

    const years = new ProgramYearRepository();
    const year = await years.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });

    const people = new PersonRepository();
    const memberships = new ClubMembershipRepository();
    const roles = new RoleAssignmentRepository();

    const vpe = await people.create({ email: 'vpe@planner.test', fullName: 'Vee Pee Ee' });
    vpeId = vpe.id;
    await roles.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId: year.id,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: vpe.id,
    });

    // Two members share a name — the ambiguity case §9.2 exists to prevent.
    const a = await people.create({ email: 'rahim.a@planner.test', fullName: 'Rahim Khan' });
    const b = await people.create({ email: 'rahim.b@planner.test', fullName: 'Rahim Khan' });
    const solo = await people.create({ email: 'aisyah@planner.test', fullName: 'Nur Aisyah' });
    rahimA = a.id;
    for (const p of [a, b, solo]) {
      await memberships.create({ personId: p.id, clubUnitId: clubId, memberType: 'new' });
    }

    const outsider = await people.create({ email: 'outsider@planner.test', fullName: 'Outsider' });
    outsiderId = outsider.id;
    await roles.assign({
      personId: outsider.id,
      orgUnitId: otherClubId,
      role: 'club_vpe',
      programYearId: year.id,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: outsider.id,
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

  it('imports a sheet: schedules the meeting, assigns what resolves, lists the rest as pending', async () => {
    const token = await jwtFor(vpeId);

    const imported = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/planner/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          {
            scheduledAt: SEPT,
            theme: 'New Beginnings',
            cells: [
              { roleKey: 'timer', name: 'Nur Aisyah' },
              { roleKey: 'grammarian', name: 'Rahim Khan' },
              { roleKey: 'ah_counter', name: 'Somebody Missing' },
              { roleKey: 'speaker', slotIndex: 0, name: 'nur   aisyah' },
            ],
          },
        ],
      })
      .expect(201);

    expect(imported.body.meetingsCreated).toBe(1);
    // 'Nur Aisyah' twice resolves; 'Rahim Khan' is ambiguous; 'Somebody Missing' is absent.
    expect(imported.body.assignmentsCreated).toBe(2);
    expect(imported.body.unresolved).toHaveLength(2);
    expect(imported.body.unresolved.map((u: { reason: string }) => u.reason).sort()).toEqual([
      'ambiguous',
      'no_match',
    ]);

    const grid = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/planner`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(grid.body).toHaveLength(1);
    expect(grid.body[0].theme).toBe('New Beginnings');
    const timer = grid.body[0].cells.find((c: { roleKey: string }) => c.roleKey === 'timer');
    expect(timer.fullName).toBe('Nur Aisyah');
    // A plan, not a commitment.
    expect(timer.status).toBe('proposed');
  });

  it('re-importing the same date matches the meeting and skips the filled slots', async () => {
    const token = await jwtFor(vpeId);

    const again = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/planner/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [{ scheduledAt: SEPT, cells: [{ roleKey: 'timer', name: 'Nur Aisyah' }] }],
      })
      .expect(201);

    expect(again.body.meetingsCreated).toBe(0);
    expect(again.body.meetingsMatched).toBe(1);
    expect(again.body.assignmentsCreated).toBe(0);
    expect(again.body.assignmentsSkipped).toBe(1);
  });

  it('a VPE of a sibling club is denied on both read and import', async () => {
    const token = await jwtFor(outsiderId);

    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/planner`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/planner/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ scheduledAt: SEPT, cells: [{ roleKey: 'timer', name: 'Nur Aisyah' }] }] })
      .expect(403);
  });

  it('rejects an unknown role key rather than dropping the cell', async () => {
    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/planner/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [{ scheduledAt: SEPT, cells: [{ roleKey: 'chief_vibes_officer', name: 'Whoever' }] }],
      })
      .expect(400);
  });

  it('never resolves a name to a member of another club', async () => {
    const token = await jwtFor(vpeId);
    expect(rahimA).toBeTruthy();

    const result = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/planner/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rows: [
          {
            scheduledAt: '2026-09-08T11:00:00.000Z',
            cells: [{ roleKey: 'timer', name: 'Outsider' }],
          },
        ],
      })
      .expect(201);

    expect(result.body.assignmentsCreated).toBe(0);
    expect(result.body.unresolved[0]).toMatchObject({ name: 'Outsider', reason: 'no_match' });
  });
});
