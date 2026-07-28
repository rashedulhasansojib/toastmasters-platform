import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { seedAccessVocabulary, type PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { EMAIL_PORT } from '../../src/common/email/email.port';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';

/**
 * M2 Slice 1 (roadmap.md §5): "A district is built top-down purely by
 * invitation; an invitation carrying a role passes the same delegation check
 * as a direct grant." Real Postgres + Redis, the real AppModule, real HTTP
 * routes — the email port is stubbed (not a real inbox), matching how M1's
 * ship gate never needed real infrastructure beyond Postgres/Redis.
 */
describe('M2 Slice 1: invitations + the delegation check (integration)', () => {
  let db: PrismaClient;
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
  const secret = 'd'.repeat(32);

  let clubId: string;
  let programYearId: string;
  let unitAdminId: string;

  const jwtFor = (personId: string) =>
    new SignJWT({ roles: [], scopes: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(personId)
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret));

  function tokenFromLastEmailTo(email: string): string {
    const message = [...sentEmails].reverse().find((m) => m.to === email);
    if (!message) throw new Error(`No email sent to ${email}`);
    const match = /invitations\/([^/]+)\/accept/.exec(message.text);
    if (!match?.[1]) throw new Error(`No invitation link found in: ${message.text}`);
    return match[1];
  }

  beforeAll(async () => {
    const { db: seedDb, url: dbUrl, stop: stopDbContainer } = await startTestDb();
    const { url: redisUrl, stop: stopRedisContainer } = await startTestRedis();
    db = seedDb;
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
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1',
      name: 'Club 1',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();

    // The top-down bootstrapper: unit_admin at the district, self_subtree
    // reach over the club beneath it (system-design.md §7.7).
    const unitAdmin = await people.create({ email: 'admin@example.com', fullName: 'Unit Admin' });
    unitAdminId = unitAdmin.id;
    await grantAdmin.grantPlatformRole({
      personId: unitAdmin.id,
      role: 'unit_admin',
      orgUnitId: district.id,
      grantedBy: unitAdmin.id,
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PORT)
      .useValue({
        send: vi.fn().mockImplementation(async (message) => {
          sentEmails.push(message);
        }),
      })
      .compile();
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

  it('unit_admin invites the first club president; they accept and can log in', async () => {
    const adminToken = await jwtFor(unitAdminId);
    const createRes = await request(app.getHttpServer())
      .post(`/v1/org-units/${clubId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'president@example.com', role: 'club_president', programYearId })
      .expect(201);
    expect(createRes.body.email).toBe('president@example.com');
    expect(createRes.body.status).toBe('pending');
    expect(createRes.body.tokenHash).toBeUndefined();

    const token = tokenFromLastEmailTo('president@example.com');
    const acceptRes = await request(app.getHttpServer())
      .post(`/v1/invitations/${token}/accept`)
      .send({ fullName: 'President Person', password: 'a-real-password' })
      .expect(200);
    expect(acceptRes.body.personId).toBeTypeOf('string');

    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'president@example.com', password: 'a-real-password' })
      .expect(200);
    expect(loginRes.body.personId).toBe(acceptRes.body.personId);

    const roleAssignments = new RoleAssignmentRepository();
    const active = await roleAssignments.findActiveForUnit(clubId, 'club_president');
    expect(active.some((r) => r.personId === acceptRes.body.personId)).toBe(true);
  });

  it('rejects invitation acceptance with an unknown token', async () => {
    await request(app.getHttpServer())
      .post('/v1/invitations/not-a-real-token/accept')
      .send({ fullName: 'Nobody', password: 'whatever1' })
      .expect(401);
  });

  it('rejects an expired invitation the same way — generic message, no enumeration', async () => {
    const people = new PersonRepository();
    const backdatedAdmin = await people.create({
      email: 'backdated-admin@example.com',
      fullName: 'Backdated Admin',
    });

    // DB-seeded directly with a known raw token, hashed the same way the
    // service hashes it, so the HTTP accept call can exercise the real
    // expired branch through InvitationRepository.accept()'s transaction.
    const rawToken = 'expired-fixture-raw-token';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const row = await db.invitation.create({
      data: {
        email: 'expired@example.com',
        tokenHash,
        orgUnitId: clubId,
        role: 'club_member',
        programYearId,
        invitedBy: backdatedAdmin.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(row.status).toBe('pending');

    await request(app.getHttpServer())
      .post(`/v1/invitations/${rawToken}/accept`)
      .send({ fullName: 'Too Late', password: 'whatever1' })
      .expect(401);

    expect(await db.person.findUnique({ where: { email: 'expired@example.com' } })).toBeNull();
  });

  it('blocks escalation: a club_member with identity.invitation:create but not identity.role_assignment:create is denied, and no Invitation row is written', async () => {
    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const grantAdmin = new GrantAdminRepository();

    const member = await people.create({
      email: 'nasrin@example.com',
      fullName: 'Nasrin',
    });
    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: clubId,
      role: 'club_member', // seeded with identity.role_assignment:read only, never :create
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: member.id,
    });
    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: clubId,
      subjectRole: 'club_member',
      resource: 'identity.invitation',
      action: 'create',
      effect: 'allow',
      createdBy: member.id,
      reason: 'test fixture: invitation-create without role-assignment-create',
    });

    const beforeCount = await db.invitation.count({ where: { email: 'escalatee@example.com' } });

    const memberToken = await jwtFor(member.id);
    await request(app.getHttpServer())
      .post(`/v1/org-units/${clubId}/invitations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ email: 'escalatee@example.com', role: 'club_vpe', programYearId })
      .expect(403);

    const afterCount = await db.invitation.count({ where: { email: 'escalatee@example.com' } });
    expect(afterCount).toBe(beforeCount);
  });

  it('rate-limits invitation creation per inviter per day', async () => {
    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();
    const orgUnits = new OrgUnitRepository();

    const region = await db.orgUnit.findFirst({ where: { type: 'region' } });
    const rateLimitDistrict = await orgUnits.createChild({
      parentId: region!.id,
      type: 'district',
      code: 'd-rate',
      name: 'Rate Limit District',
      timezone: 'Asia/Dhaka',
    });
    const rateLimitClub = await orgUnits.createChild({
      parentId: rateLimitDistrict.id,
      type: 'club',
      code: 'c-rate',
      name: 'Rate Limit Club',
      timezone: 'Asia/Dhaka',
    });
    const dedicatedAdmin = await people.create({
      email: 'rate-limit-admin@example.com',
      fullName: 'Rate Limit Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: dedicatedAdmin.id,
      role: 'unit_admin',
      orgUnitId: rateLimitDistrict.id,
      grantedBy: dedicatedAdmin.id,
    });
    const adminToken = await jwtFor(dedicatedAdmin.id);

    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer())
        .post(`/v1/org-units/${rateLimitClub.id}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `invitee-${i}@example.com`, role: 'club_member', programYearId })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/v1/org-units/${rateLimitClub.id}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'invitee-21@example.com', role: 'club_member', programYearId })
      .expect(429);
  });
});
