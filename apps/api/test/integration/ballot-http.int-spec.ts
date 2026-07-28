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

/** M3 Slice 10: award ballots, anonymous per system-design.md §9.4. */
describe('M3 Slice 10: ballots (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let clubBId: string;
  let programYearId: string;
  let meetingId: string;
  let vpeId: string;
  let voterAId: string;
  let voterBId: string;
  let candidateWinnerId: string;
  let candidateLoserId: string;
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
      code: 'r9',
      name: 'Region 9',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd49',
      name: 'District 49',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c15',
      name: 'Club 15',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c16',
      name: 'Club 16',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubBId = clubB.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2034-2035',
      startsOn: new Date('2034-07-01'),
      endsOn: new Date('2035-06-30'),
    });
    programYearId = year.id;
    // A second program year purely so a second club_member RoleAssignment in
    // the same club doesn't collide with the M1 role_assignment_singleton
    // index, which isn't yet relaxed per role_template.is_singleton
    // (rbac-design.md §3's noted follow-up) — authorize() only reads
    // status='active' and ignores programYearId, so this doesn't affect the
    // grants either voter actually gets.
    const secondYear = await programYears.create({
      id: '2035-2036',
      startsOn: new Date('2035-07-01'),
      endsOn: new Date('2036-06-30'),
    });

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();

    async function makeVpe(email: string, name: string, unitId: string) {
      const p = await people.create({ email, fullName: name });
      await roleAssignments.assign({
        personId: p.id,
        orgUnitId: unitId,
        role: 'club_vpe',
        programYearId,
        termStart: new Date('2034-07-01'),
        termEnd: new Date('2035-06-30'),
        appointedBy: p.id,
      });
      return p.id;
    }

    vpeId = await makeVpe('vpe9@example.com', 'VPE Nine', clubId);
    outsiderId = await makeVpe('outsider9@example.com', 'Outsider Nine', clubBId);

    const voterA = await people.create({ email: 'votera9@example.com', fullName: 'Voter A' });
    voterAId = voterA.id;
    await roleAssignments.assign({
      personId: voterA.id,
      orgUnitId: clubId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2034-07-01'),
      termEnd: new Date('2035-06-30'),
      appointedBy: vpeId,
    });
    const voterB = await people.create({ email: 'voterb9@example.com', fullName: 'Voter B' });
    voterBId = voterB.id;
    await roleAssignments.assign({
      personId: voterB.id,
      orgUnitId: clubId,
      role: 'club_member',
      programYearId: secondYear.id,
      termStart: new Date('2035-07-01'),
      termEnd: new Date('2036-06-30'),
      appointedBy: vpeId,
    });
    const winner = await people.create({ email: 'winner9@example.com', fullName: 'Winner' });
    candidateWinnerId = winner.id;
    const loser = await people.create({ email: 'loser9@example.com', fullName: 'Loser' });
    candidateLoserId = loser.id;

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2034-08-01T18:00:00Z'),
      createdBy: vpeId,
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

  it('a VPE opens a best-speaker ballot, two members vote, a duplicate vote is rejected, and tallying picks the winner', async () => {
    const vpeToken = await jwtFor(vpeId);
    const base = `/v1/clubs/${clubId}/meetings/${meetingId}/ballots`;

    const created = await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${vpeToken}`)
      .send({
        category: 'best_speaker',
        eligibility: 'members_present',
        candidates: [
          { personId: candidateWinnerId, label: 'Winner' },
          { personId: candidateLoserId, label: 'Loser' },
        ],
      })
      .expect(201);
    expect(created.body.status).toBe('open');

    const voterAToken = await jwtFor(voterAId);
    const voterBToken = await jwtFor(voterBId);

    await request(app.getHttpServer())
      .post(`${base}/${created.body.id}/votes`)
      .set('Authorization', `Bearer ${voterAToken}`)
      .send({ candidatePersonId: candidateWinnerId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${base}/${created.body.id}/votes`)
      .set('Authorization', `Bearer ${voterBToken}`)
      .send({ candidatePersonId: candidateWinnerId })
      .expect(201);

    // duplicate vote by the same voter is rejected
    await request(app.getHttpServer())
      .post(`${base}/${created.body.id}/votes`)
      .set('Authorization', `Bearer ${voterAToken}`)
      .send({ candidatePersonId: candidateLoserId })
      .expect(409);

    const tallied = await request(app.getHttpServer())
      .post(`${base}/${created.body.id}/tally`)
      .set('Authorization', `Bearer ${vpeToken}`)
      .expect(201);
    expect(tallied.body.status).toBe('tallied');
    expect(tallied.body.tallyResult.winnerPersonId).toBe(candidateWinnerId);
    expect(tallied.body.tallyResult.tally).toEqual(
      expect.arrayContaining([{ personId: candidateWinnerId, count: 2 }]),
    );

    // voting after tally is rejected
    const voterCToken = await jwtFor(voterAId);
    await request(app.getHttpServer())
      .post(`${base}/${created.body.id}/votes`)
      .set('Authorization', `Bearer ${voterCToken}`)
      .send({ candidatePersonId: candidateLoserId })
      .expect(400);
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const outsiderToken = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/meetings/${meetingId}/ballots`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        category: 'best_evaluator',
        eligibility: 'members_present',
        candidates: [
          { personId: candidateWinnerId, label: 'Winner' },
          { personId: candidateLoserId, label: 'Loser' },
        ],
      })
      .expect(403);
  });
});
