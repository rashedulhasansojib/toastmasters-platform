import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
import { seedAccessVocabulary, seedPathwayCatalog, type PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { MeetingRepository } from '../../src/modules/meeting/meeting.repository';

/**
 * M11 Slice 1: closing a meeting auto-requests VPE approval for every
 * approved speech slot. Idempotent — re-closing a meeting emits no
 * duplicate rows (relies on the unique on `speech_slot_id`).
 */
describe('M11 Slice 1: speech-approval auto-request on meeting close (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  let db: PrismaClient;
  const secret = 'e'.repeat(32);
  const SCHEDULED = new Date('2028-08-15T18:00:00.000Z');

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
    const { db: prismaDb, url: dbUrl, stop: stopDbContainer } = await startTestDb();
    const { url: redisUrl, stop: stopRedisContainer } = await startTestRedis();
    stopDb = stopDbContainer;
    stopRedis = stopRedisContainer;
    db = prismaDb;

    process.env.DATABASE_URL = dbUrl;
    process.env.DIRECT_URL = dbUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.SESSION_JWT_SECRET = secret;
    await seedAccessVocabulary(db);
    await seedPathwayCatalog(db);

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
      id: '2028-2029',
      startsOn: new Date('2028-07-01'),
      endsOn: new Date('2029-06-30'),
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
      termStart: new Date('2028-07-01'),
      termEnd: new Date('2029-06-30'),
      appointedBy: vpe.id,
    });
    const member = await people.create({
      email: 'member11@example.com',
      fullName: 'Member Eleven',
    });
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

  async function newMeetingWithSlots(opts: {
    approvedSlots: Array<{ speakerPersonId: string | null; requestedBy: string }>;
    declinedSlots?: Array<{ speakerPersonId: string | null; requestedBy: string }>;
  }): Promise<string> {
    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: SCHEDULED,
      createdBy: vpeId,
    });
    // The slots are inserted directly — the request → approve HTTP flow is
    // already covered by the speech-slot integration spec; this spec is
    // about what meeting-close does with them.
    for (const s of opts.approvedSlots) {
      await db.speechSlot.create({
        data: {
          meetingId: meeting.id,
          title: 'Ice Breaker',
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          level: 1,
          plannedDurationSeconds: 300,
          requestedBy: s.requestedBy,
          speakerPersonId: s.speakerPersonId,
          status: 'approved',
        },
      });
    }
    for (const s of opts.declinedSlots ?? []) {
      await db.speechSlot.create({
        data: {
          meetingId: meeting.id,
          title: 'Skipped',
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          level: 1,
          plannedDurationSeconds: 300,
          requestedBy: s.requestedBy,
          speakerPersonId: s.speakerPersonId,
          status: 'declined',
        },
      });
    }
    return meeting.id;
  }

  async function walkToInProgress(meetingId: string): Promise<void> {
    const token = await jwtFor(vpeId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}`;
    await request(app.getHttpServer())
      .post(`${base}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  }

  it('closing a meeting creates one SpeechApproval per approved slot; declined slots are skipped', async () => {
    const meetingId = await newMeetingWithSlots({
      approvedSlots: [
        { speakerPersonId: memberId, requestedBy: vpeId },
        { speakerPersonId: null, requestedBy: memberId },
      ],
      declinedSlots: [{ speakerPersonId: memberId, requestedBy: vpeId }],
    });
    await walkToInProgress(meetingId);

    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const approvals = await db.speechApproval.findMany({
      where: { clubUnitId: clubId },
      orderBy: { createdAt: 'asc' },
    });
    expect(approvals).toHaveLength(2);
    expect(approvals.every((a) => a.status === 'requested')).toBe(true);
    expect(approvals.every((a) => a.requestedAt.getTime() === SCHEDULED.getTime())).toBe(true);
    // Speaker credit follows the same rule as the roster projection:
    // speakerPersonId ?? requestedBy.
    const persons = approvals.map((a) => a.personId).sort();
    expect(persons).toEqual([memberId, memberId].sort());
  });

  it('closing a meeting with no approved prepared speeches creates zero approvals', async () => {
    const meetingId = await newMeetingWithSlots({
      approvedSlots: [],
      declinedSlots: [{ speakerPersonId: memberId, requestedBy: vpeId }],
    });
    await walkToInProgress(meetingId);

    const token = await jwtFor(vpeId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const approvals = await db.speechApproval.findMany({
      where: {
        speechSlot: { meetingId },
      },
    });
    expect(approvals).toEqual([]);
  });
});
