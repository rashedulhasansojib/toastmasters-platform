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
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';
import { MeetingRepository } from '../../src/modules/meeting/meeting.repository';

/** M3 Slice 8: ranked role-rotation suggestions (system-design.md §9.3). Reuses meeting.role:read — no new resource, so no dedicated 403 test here (already covered by Slice 3's). */
describe('M3 Slice 8: role rotation suggestions (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let programYearId: string;
  let meetingId: string;
  let vpeId: string;
  let assignedMemberId: string;
  let unassignedMemberId: string;

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
      code: 'r7',
      name: 'Region 7',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd47',
      name: 'District 47',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c13',
      name: 'Club 13',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2032-2033',
      startsOn: new Date('2032-07-01'),
      endsOn: new Date('2033-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpe = await people.create({ email: 'vpe7@example.com', fullName: 'VPE Seven' });
    vpeId = vpe.id;
    await roleAssignments.assign({
      personId: vpe.id,
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      termStart: new Date('2032-07-01'),
      termEnd: new Date('2033-06-30'),
      appointedBy: vpe.id,
    });

    const clubMemberships = new ClubMembershipRepository();

    // Only ClubMembership.localStatus feeds the suggestion query (not
    // RoleAssignment) — and the M1 role_assignment_singleton index isn't yet
    // relaxed per role_template.is_singleton (rbac-design.md §3's own noted
    // follow-up), so a second club_member RoleAssignment in the same
    // (club, year) would collide. Skip it; these people only need identity.
    const assigned = await people.create({
      email: 'assigned7@example.com',
      fullName: 'Assigned Member',
    });
    assignedMemberId = assigned.id;
    await clubMemberships.create({ personId: assigned.id, clubUnitId: clubId, memberType: 'new' });

    const unassigned = await people.create({
      email: 'unassigned7@example.com',
      fullName: 'Unassigned Member',
    });
    unassignedMemberId = unassigned.id;
    await clubMemberships.create({
      personId: unassigned.id,
      clubUnitId: clubId,
      memberType: 'new',
    });

    const meetings = new MeetingRepository();
    const meeting = await meetings.create({
      clubUnitId: clubId,
      programYearId,
      scheduledAt: new Date('2032-08-01T18:00:00Z'),
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
      .send({ roleKey: 'timer', assignee: { kind: 'member', personId: assignedMemberId } })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
    await stopDb();
    await stopRedis();
  });

  it('suggests active members not already assigned in this meeting, ranked with a reason', async () => {
    const token = await jwtFor(vpeId);
    const res = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/meetings/${meetingId}/role-assignments/suggestions`)
      .query({ roleKey: 'ah_counter' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const personIds = res.body.map((s: { personId: string }) => s.personId);
    expect(personIds).toContain(unassignedMemberId);
    expect(personIds).not.toContain(assignedMemberId);
    const suggestion = res.body.find(
      (s: { personId: string }) => s.personId === unassignedMemberId,
    );
    expect(suggestion.lastFulfilledAt).toBeNull();
    expect(suggestion.reason).toBe('Unassigned Member — never held ah_counter');
  });
});
