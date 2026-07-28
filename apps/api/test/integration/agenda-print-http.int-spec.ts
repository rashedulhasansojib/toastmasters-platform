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

/** M3 Slice 12: printable agenda (self-contained HTML — see the controller's own scoping note on why no PDF library yet). Reuses meeting.agenda_item:read — no new resource, no dedicated 403 test. */
describe('M3 Slice 12: printable agenda (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let programYearId: string;
  let meetingId: string;
  let vpeId: string;

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
      code: 'r11',
      name: 'Region 11',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd51',
      name: 'District 51',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c18',
      name: 'Club 18',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2037-2038',
      startsOn: new Date('2037-07-01'),
      endsOn: new Date('2038-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe11@example.com', fullName: 'VPE Eleven' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2037-07-01'),
      termEnd: new Date('2038-06-30'),
      appointedBy: vpe.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2037-08-01T18:00:00Z'),
      createdBy: vpe.id,
    });
    meetingId = meeting.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/agenda-items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Table Topics', plannedDurationSeconds: 600, roleKey: 'table_topics_master' })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
    await stopDb();
    await stopRedis();
  });

  it('renders a print-ready HTML agenda with the item and its role', async () => {
    const token = await jwtFor(vpeId);
    const res = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/meetings/${meetingId}/agenda/print`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Table Topics');
    expect(res.text).toContain('table_topics_master');
    expect(res.text).toContain('10 min');
  });
});
