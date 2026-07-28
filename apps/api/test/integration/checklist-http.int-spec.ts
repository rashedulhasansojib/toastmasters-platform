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

/** M3 Slice 5: meeting checklists (template + run). */
describe('M3 Slice 5: checklists (integration)', () => {
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
      code: 'r4',
      name: 'Region 4',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd44',
      name: 'District 44',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c7',
      name: 'Club 7',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c8',
      name: 'Club 8',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2029-2030',
      startsOn: new Date('2029-07-01'),
      endsOn: new Date('2030-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe4@example.com', fullName: 'VPE Four' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2029-07-01'),
      termEnd: new Date('2030-06-30'),
      appointedBy: vpe.id,
    });

    const outsider = await people.create({
      email: 'outsider4@example.com',
      fullName: 'Outsider Four',
    });
    outsiderId = outsider.id;
    await roleAssignments.assign({
      personId: outsider.id,
      orgUnitId: clubB.id,
      role: 'club_member',
      programYearId,
      termStart: new Date('2029-07-01'),
      termEnd: new Date('2030-06-30'),
      appointedBy: outsider.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2029-08-01T18:00:00Z'),
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

  it('a club_vpe creates a template, starts a run on a meeting, and marking every item done completes the run', async () => {
    const token = await jwtFor(vpeId);

    const template = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/checklist-templates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Standard meeting',
        appliesTo: 'meeting',
        items: [
          { key: 'banner', label: 'Put up the banner', ownerRole: null, phase: 'before' },
          { key: 'timer_ready', label: 'Timer device charged', ownerRole: null, phase: 'before' },
        ],
      })
      .expect(201);
    expect(template.body.items).toEqual([
      { key: 'banner', order: 0, label: 'Put up the banner', ownerRole: null, phase: 'before' },
      {
        key: 'timer_ready',
        order: 1,
        label: 'Timer device charged',
        ownerRole: null,
        phase: 'before',
      },
    ]);

    const runsBase = `/v1/clubs/${clubId}/meetings/${meetingId}/checklist-runs`;
    const run = await request(app.getHttpServer())
      .post(runsBase)
      .set('Authorization', `Bearer ${token}`)
      .send({ templateId: template.body.id })
      .expect(201);
    expect(run.body.completedAt).toBeNull();
    expect(run.body.items).toHaveLength(2);

    await request(app.getHttpServer())
      .patch(`${runsBase}/${run.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'banner', done: true })
      .expect(200);

    const completed = await request(app.getHttpServer())
      .patch(`${runsBase}/${run.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'timer_ready', done: true })
      .expect(200);
    expect(completed.body.completedAt).not.toBeNull();
    expect(completed.body.items.every((i: { done: boolean }) => i.done)).toBe(true);
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const token = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/checklist-templates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Intrusion',
        appliesTo: 'meeting',
        items: [{ key: 'x', label: 'x', ownerRole: null, phase: 'before' }],
      })
      .expect(403);
  });
});
