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

/**
 * M3 Slice 12 / M9: printable agenda (self-contained HTML — see the
 * controller's own scoping note on why no PDF library yet).
 *
 * M9 changed what it prints: the agenda is now *derived* from the role
 * assignments and prepared speakers (the legacy portal's model) rather than
 * transcribed from hand-entered line items, so this asserts the fixed
 * running order and the people slotted into it. Reuses
 * meeting.speech_slot:read — no new resource.
 */
describe('M3 Slice 12 / M9: printable agenda (integration)', () => {
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
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/role-assignments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleKey: 'table_topics_master', assignee: { kind: 'member', personId: vpeId } })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
    await stopDb();
    await stopRedis();
  });

  it('derives the fixed running order and slots the assigned role holder in', async () => {
    const token = await jwtFor(vpeId);
    const res = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/meetings/${meetingId}/agenda/print`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');

    // The fixed running order, derived rather than entered.
    expect(res.text).toContain('Sergeant at Arms opens the floor');
    expect(res.text).toContain('TMOE introduces the Table Topic Master');
    expect(res.text).toContain('Meeting Conclusion');

    // The assigned Table Topics Master is resolved to a name, not an id.
    expect(res.text).toContain('VPE Eleven');
    expect(res.text).not.toContain(vpeId);

    // Times run from the meeting's start (18:00Z), not from a stored column.
    expect(res.text).toContain('6:00 PM');
  });

  it('404s a meeting that belongs to another club', async () => {
    const token = await jwtFor(vpeId);
    const otherClubId = '00000000-0000-0000-0000-0000000000ff';
    await request(app.getHttpServer())
      .get(`/v1/clubs/${otherClubId}/meetings/${meetingId}/agenda/print`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => {
        // Denied before the row is reachable: 403 from the scope guard, or
        // 404 once scope passes but the meeting isn't in that club.
        if (![403, 404].includes(res.status)) {
          throw new Error(`expected 403 or 404, got ${res.status}`);
        }
      });
  });
});
