import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
import { getPrisma, seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { MeetingRepository } from '../../src/modules/meeting/meeting.repository';

/** M3 Slice 7: live meeting-day tools (timer/ah-counter/grammarian), idempotent writes. */
describe('M3 Slice 7: meeting live records (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let programYearId: string;
  let meetingId: string;
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

    const orgUnits = new OrgUnitRepository();
    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r6',
      name: 'Region 6',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd46',
      name: 'District 46',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c11',
      name: 'Club 11',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c12',
      name: 'Club 12',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2031-2032',
      startsOn: new Date('2031-07-01'),
      endsOn: new Date('2032-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const member = await people.create({ email: 'member6@example.com', fullName: 'Member Six' });
    memberId = member.id;
    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: clubId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2031-07-01'),
      termEnd: new Date('2032-06-30'),
      appointedBy: member.id,
    });

    const outsider = await people.create({
      email: 'outsider6@example.com',
      fullName: 'Outsider Six',
    });
    outsiderId = outsider.id;
    await roleAssignments.assign({
      personId: outsider.id,
      orgUnitId: clubB.id,
      role: 'club_member',
      programYearId,
      termStart: new Date('2031-07-01'),
      termEnd: new Date('2032-06-30'),
      appointedBy: outsider.id,
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2031-08-01T18:00:00Z'),
      createdBy: member.id,
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

  it('a member (as Timer) records elapsed time; replaying the same clientKey after a dropped connection does not duplicate it', async () => {
    const token = await jwtFor(memberId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}/live-records`;
    const body = {
      kind: 'timer' as const,
      clientKey: 'timer-speech-1-final',
      targetKey: 'slot-speech-1',
      targetLabel: 'Speaker: Jane',
      payload: { category: 'speech', elapsedMs: 305_000, signal: 'green' as const },
    };

    const first = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    const replayed = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    expect(replayed.body.id).toBe(first.body.id);

    const list = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].payload).toEqual(body.payload);
  });

  /**
   * The regression this suite previously missed. `clientKey` was doing double
   * duty as both the retry key and the identity of the report, so the second
   * save of a corrected report collided with the first, was swallowed by the
   * idempotent upsert, and returned 201 with the *stale* payload — the tally
   * the Grammarian had just fixed silently never reached the record.
   */
  it('re-saving a corrected report supersedes the earlier one instead of being swallowed', async () => {
    const token = await jwtFor(memberId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}/live-records`;
    const targetKey = 'grammarian';

    const first = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'grammarian',
        targetKey,
        clientKey: `${targetKey}:attempt-1`,
        payload: { wordOfDayUses: 2, corrections: [] },
      })
      .expect(201);

    const corrected = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'grammarian',
        targetKey,
        clientKey: `${targetKey}:attempt-2`,
        payload: {
          wordOfDayUses: 7,
          corrections: [{ said: 'could of', shouldHaveBeen: 'could have' }],
        },
      })
      .expect(201);

    // A new row, not a mutation of the old one — the table is append-only.
    expect(corrected.body.id).not.toBe(first.body.id);
    expect(corrected.body.payload.wordOfDayUses).toBe(7);

    // The read model shows only the correction, not both revisions.
    const list = await request(app.getHttpServer())
      .get(base)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const grammarian = (list.body as { kind: string; payload: { wordOfDayUses: number } }[]).filter(
      (r) => r.kind === 'grammarian',
    );
    expect(grammarian).toHaveLength(1);
    expect(grammarian[0]?.payload.wordOfDayUses).toBe(7);

    // …and the superseded revision is still there as history.
    const history = await request(app.getHttpServer())
      .get(`${base}?targetKey=${targetKey}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body).toHaveLength(2);
    expect((history.body as { id: string }[])[0]?.id).toBe(corrected.body.id);
  });

  /**
   * Guards the append-only REVOKE itself. This only means anything because the
   * test container now runs as a non-superuser role (see test/support/test-db.ts)
   * — a superuser bypasses the privilege check and the assertion would pass
   * vacuously.
   */
  it('the live-record table rejects UPDATE and DELETE at the database', async () => {
    const db = getPrisma();
    await expect(
      db.$executeRawUnsafe(`UPDATE "meeting_live_record" SET "target_label" = 'tampered'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.$executeRawUnsafe(`DELETE FROM "meeting_live_record"`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const token = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/live-records`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ah_counter',
        clientKey: 'intrusion',
        targetKey: 'role-intrusion',
        payload: { counts: [{ word: 'um', count: 1 }] },
      })
      .expect(403);
  });
});
