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
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';

/**
 * M11 Slice 2: VPE approve/deny endpoints for auto-requested speech
 * approvals.
 *
 * The important assertions are the negative ones (CLAUDE.md §7): a VPE from a
 * sibling club must not be able to see, approve, or deny another club's
 * approvals — sibling-club isolation is what makes the club-scoped grant
 * actually club-scoped.
 */
describe('M11 Slice 2: speech-approval HTTP surface (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  let db: PrismaClient;
  const secret = 'f'.repeat(32);
  const CLOSED_AT = new Date('2028-09-10T18:00:00.000Z');

  let clubAId: string;
  let clubBId: string;
  let vpeAId: string;
  let vpeBId: string;
  let memberAId: string;
  let approvalAId: string;
  let approvalBId: string;

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
      code: 'r13',
      name: 'Region 13',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd53',
      name: 'District 53',
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
    clubBId = clubB.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2028-2029-approval',
      startsOn: new Date('2028-07-01'),
      endsOn: new Date('2029-06-30'),
    });

    const people = new PersonRepository();
    const memberships = new ClubMembershipRepository();
    const roleAssignments = new RoleAssignmentRepository();

    const vpeA = await people.create({ email: 'vpeA@example.com', fullName: 'Vera A' });
    const vpeB = await people.create({ email: 'vpeB@example.com', fullName: 'Vera B' });
    const memberA = await people.create({ email: 'memA@example.com', fullName: 'Ana A' });
    vpeAId = vpeA.id;
    vpeBId = vpeB.id;
    memberAId = memberA.id;

    for (const [person, clubId, role] of [
      [vpeA, clubAId, 'club_vpe'],
      [memberA, clubAId, 'club_member'],
      [vpeB, clubBId, 'club_vpe'],
    ] as const) {
      await memberships.create({ personId: person.id, clubUnitId: clubId, memberType: 'new' });
      await roleAssignments.assign({
        personId: person.id,
        orgUnitId: clubId,
        role,
        programYearId: year.id,
        termStart: new Date('2028-07-01'),
        termEnd: new Date('2029-06-30'),
        appointedBy: person.id,
      });
    }

    // Two closed meetings, each with an approved slot and an auto-created
    // SpeechApproval row — one row per club, so a VPE reaching across clubs
    // has something concrete to be denied on.
    for (const [clubId, meetingKey, memberId, holderRef, ref] of [
      [clubAId, 'mA', memberAId, 'A', 'A'],
      [clubBId, 'mB', vpeBId, 'B', 'B'],
    ] as const) {
      const meeting = await db.meeting.create({
        data: {
          clubUnitId: clubId,
          programYearId: year.id,
          scheduledAt: CLOSED_AT,
          status: 'closed',
          createdBy: holderRef === 'A' ? vpeAId : vpeBId,
          title: `Meeting ${meetingKey}`,
        },
      });
      const slot = await db.speechSlot.create({
        data: {
          meetingId: meeting.id,
          title: `Ice Breaker ${ref}`,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          level: 1,
          plannedDurationSeconds: 300,
          requestedBy: memberId,
          speakerPersonId: memberId,
          status: 'approved',
        },
      });
      const approval = await db.speechApproval.create({
        data: {
          speechSlotId: slot.id,
          personId: memberId,
          clubUnitId: clubId,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          level: 1,
          requestedAt: CLOSED_AT,
        },
      });
      if (ref === 'A') approvalAId = approval.id;
      else approvalBId = approval.id;
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

  describe('GET /clubs/:clubUnitId/education/approvals', () => {
    it("returns the VPE's own club's approvals, filtered by status", async () => {
      const token = await jwtFor(vpeAId);
      const all = await request(app.getHttpServer())
        .get(`/v1/clubs/${clubAId}/education/approvals`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((all.body as unknown[]).length).toBe(1);
      expect((all.body as { id: string }[])[0]?.id).toBe(approvalAId);

      const requested = await request(app.getHttpServer())
        .get(`/v1/clubs/${clubAId}/education/approvals?status=requested`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((requested.body as unknown[]).length).toBe(1);

      const approved = await request(app.getHttpServer())
        .get(`/v1/clubs/${clubAId}/education/approvals?status=approved`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(approved.body).toEqual([]);
    });

    it('denies a plain member the club-wide approvals list — their own grant is condition:own, not any', async () => {
      const token = await jwtFor(memberAId);
      await request(app.getHttpServer())
        .get(`/v1/clubs/${clubAId}/education/approvals`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('denies VPE A a sibling club they hold no grant on', async () => {
      const token = await jwtFor(vpeAId);
      await request(app.getHttpServer())
        .get(`/v1/clubs/${clubBId}/education/approvals`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('POST /clubs/:clubUnitId/education/approvals/:id/approve', () => {
    it('approves a pending row and stamps the approver + timestamp', async () => {
      const token = await jwtFor(vpeAId);
      const res = await request(app.getHttpServer())
        .post(`/v1/clubs/${clubAId}/education/approvals/${approvalAId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);

      const body = res.body as {
        id: string;
        status: string;
        approvedBy: string;
        approvedAt: string;
      };
      expect(body).toMatchObject({ id: approvalAId, status: 'approved', approvedBy: vpeAId });
      expect(body.approvedAt).toBeTruthy();
    });

    it('rejects re-approval of an already-approved row', async () => {
      const token = await jwtFor(vpeAId);
      await request(app.getHttpServer())
        .post(`/v1/clubs/${clubAId}/education/approvals/${approvalAId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("blocks VPE A from approving Club B's row via Club B's URL — sibling-club scope denial", async () => {
      const token = await jwtFor(vpeAId);
      await request(app.getHttpServer())
        .post(`/v1/clubs/${clubBId}/education/approvals/${approvalBId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(403);
    });

    it("blocks VPE A from approving Club B's row via Club A's URL — the id-guessing attempt gets a 404", async () => {
      // The URL says Club A (which the caller can act on), but the approval
      // id belongs to Club B. The service's cross-club check returns 404
      // rather than 403 — existence of the row on another club is not the
      // caller's business.
      const token = await jwtFor(vpeAId);
      await request(app.getHttpServer())
        .post(`/v1/clubs/${clubAId}/education/approvals/${approvalBId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
    });

    it('denies a plain member the approve action', async () => {
      const token = await jwtFor(memberAId);
      await request(app.getHttpServer())
        .post(`/v1/clubs/${clubAId}/education/approvals/${approvalBId}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(403);
    });
  });

  describe('POST /clubs/:clubUnitId/education/approvals/:id/deny', () => {
    it('rejects a deny with an empty reason before the service sees it (Zod strict body → 400)', async () => {
      // The pipe runs before the controller, so an empty-reason body is
      // rejected on a still-`requested` row. Ordered first so the row is
      // fresh for this Zod-path assertion.
      const token = await jwtFor(vpeBId);
      const res = await request(app.getHttpServer())
        .post(`/v1/clubs/${clubBId}/education/approvals/${approvalBId}/deny`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '' })
        .expect(400);
      // ProblemJsonFilter renders the Zod issues so the 400 is distinguishable
      // from the "already denied" 400 that comes later.
      const body = res.body as { title?: string; issues?: unknown[] };
      expect(body.title).toBe('Validation failed');
    });

    it('denies with a reason and stamps the denier', async () => {
      const token = await jwtFor(vpeBId);
      const res = await request(app.getHttpServer())
        .post(`/v1/clubs/${clubBId}/education/approvals/${approvalBId}/deny`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Speech was under half the timed minimum' })
        .expect(201);

      const body = res.body as {
        id: string;
        status: string;
        deniedBy: string;
        denialReason: string;
      };
      expect(body).toMatchObject({
        id: approvalBId,
        status: 'denied',
        deniedBy: vpeBId,
        denialReason: 'Speech was under half the timed minimum',
      });
    });

    it('rejects a re-deny of a decided row', async () => {
      const token = await jwtFor(vpeBId);
      await request(app.getHttpServer())
        .post(`/v1/clubs/${clubBId}/education/approvals/${approvalBId}/deny`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'again' })
        .expect(400);
    });
  });

  describe('GET /clubs/:clubUnitId/education/progress with approval join', () => {
    it("attaches the delivered project's approvalId, approvalStatus and approvedAt", async () => {
      // Ana Rahman (memberAId) has an EducationRecord? Not yet. Start one so
      // the roster projects the PM path against her.
      const token = await jwtFor(vpeAId);
      await request(app.getHttpServer())
        .post(`/v1/clubs/${clubAId}/education-records`)
        .set('Authorization', `Bearer ${token}`)
        .send({ personId: memberAId, pathCode: 'PM' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/clubs/${clubAId}/education/progress`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rows = res.body as Array<{
        personId: string;
        pathCode: string | null;
        deliveredProjects: Array<{
          projectCode: string;
          approvalId: string | null;
          approvalStatus: 'requested' | 'approved' | 'denied' | null;
          approvedAt: string | null;
        }>;
      }>;
      const ana = rows.find((r) => r.personId === memberAId && r.pathCode === 'PM');
      const iceBreaker = ana?.deliveredProjects.find((p) => p.projectCode === 'PM-ICE-BREAKER');
      expect(iceBreaker?.approvalId).toBe(approvalAId);
      // Approval A was flipped to `approved` earlier in this describe block's
      // execution order — status flows through.
      expect(iceBreaker?.approvalStatus).toBe('approved');
      expect(iceBreaker?.approvedAt).toBeTruthy();
    });
  });
});
