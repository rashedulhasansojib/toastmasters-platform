import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
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
 * M2 Slice 2 (roadmap.md §5, FR-ORG-3): the org tree editor, combined with
 * Slice 1's invitations, run the whole M2 ship gate over real HTTP — nothing
 * seeded directly except the one-time region root and the first unit_admin.
 */
describe('M2 Slice 2: org tree editor + transactional reparent (integration)', () => {
  let db: PrismaClient;
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let regionId: string;
  let programYearId: string;

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

  const sentEmails: Array<{ to: string; subject: string; text: string }> = [];

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
    regionId = region.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PORT)
      .useValue({
        send: async (message: { to: string; subject: string; text: string }) => {
          sentEmails.push(message);
        },
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

  it('the M2 ship gate over HTTP: unit_admin builds a district, a club, and invites the first president — nothing else seeded directly', async () => {
    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();
    const admin = await people.create({ email: 'ship-gate-admin@example.com', fullName: 'Admin' });
    await grantAdmin.grantPlatformRole({
      personId: admin.id,
      role: 'unit_admin',
      orgUnitId: regionId,
      grantedBy: admin.id,
    });
    const adminToken = await jwtFor(admin.id);

    const districtRes = await request(app.getHttpServer())
      .post(`/v1/org-units/${regionId}/children`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'district', name: 'District 41', code: 'd41-http', timezone: 'Asia/Dhaka' })
      .expect(201);
    const districtId = districtRes.body.id as string;
    expect(districtRes.body.path).toBe('r1.d41-http');

    const clubRes = await request(app.getHttpServer())
      .post(`/v1/org-units/${districtId}/children`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'club', name: 'Club 1234', code: 'c1234-http', timezone: 'Asia/Dhaka' })
      .expect(201);
    const clubId = clubRes.body.id as string;
    expect(clubRes.body.path).toBe('r1.d41-http.c1234-http');

    const inviteRes = await request(app.getHttpServer())
      .post(`/v1/org-units/${clubId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'http-president@example.com', role: 'club_president', programYearId })
      .expect(201);
    expect(inviteRes.body.orgUnitId).toBe(clubId);

    const token = tokenFromLastEmailTo('http-president@example.com');
    const acceptRes = await request(app.getHttpServer())
      .post(`/v1/invitations/${token}/accept`)
      .send({ fullName: 'HTTP President', password: 'a-real-password' })
      .expect(200);

    const roleAssignments = new RoleAssignmentRepository();
    const active = await roleAssignments.findActiveForUnit(clubId, 'club_president');
    expect(active.some((r) => r.personId === acceptRes.body.personId)).toBe(true);
  });

  it('denies reparenting into a subtree the actor has no authority over — the destination-authority check', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();

    const districtA = await orgUnits.createChild({
      parentId: regionId,
      type: 'district',
      code: 'd-deny-a',
      name: 'District Deny A',
      timezone: 'UTC',
    });
    const districtB = await orgUnits.createChild({
      parentId: regionId,
      type: 'district',
      code: 'd-deny-b',
      name: 'District Deny B',
      timezone: 'UTC',
    });
    const club = await orgUnits.createChild({
      parentId: districtA.id,
      type: 'club',
      code: 'c-deny',
      name: 'Club Deny',
      timezone: 'UTC',
    });

    const scopedAdmin = await people.create({
      email: 'scoped-admin@example.com',
      fullName: 'Scoped Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: scopedAdmin.id,
      role: 'unit_admin',
      orgUnitId: districtA.id, // authority over District A's subtree only
      grantedBy: scopedAdmin.id,
    });
    const scopedAdminToken = await jwtFor(scopedAdmin.id);

    await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/reparent`)
      .set('Authorization', `Bearer ${scopedAdminToken}`)
      .send({ newParentId: districtB.id })
      .expect(403);

    const unchanged = await orgUnits.findById(club.id);
    expect(unchanged?.parentId).toBe(districtA.id);
  });

  it('reparenting bumps permissionVersion for everyone holding a grant in the moved subtree', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const grantAdmin = new GrantAdminRepository();

    const sourceDistrict = await orgUnits.createChild({
      parentId: regionId,
      type: 'district',
      code: 'd-bump-http-src',
      name: 'District Bump HTTP Src',
      timezone: 'UTC',
    });
    const destDistrict = await orgUnits.createChild({
      parentId: regionId,
      type: 'district',
      code: 'd-bump-http-dest',
      name: 'District Bump HTTP Dest',
      timezone: 'UTC',
    });
    const club = await orgUnits.createChild({
      parentId: sourceDistrict.id,
      type: 'club',
      code: 'c-bump-http',
      name: 'Club Bump HTTP',
      timezone: 'UTC',
    });

    const president = await people.create({
      email: 'bump-http-president@example.com',
      fullName: 'Bump HTTP President',
    });
    await roleAssignments.assign({
      personId: president.id,
      orgUnitId: club.id,
      role: 'club_president',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: president.id,
    });

    const regionAdmin = await people.create({
      email: 'region-admin@example.com',
      fullName: 'Region Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: regionAdmin.id,
      role: 'unit_admin',
      orgUnitId: regionId, // self_subtree over the whole region — covers both districts
      grantedBy: regionAdmin.id,
    });
    const regionAdminToken = await jwtFor(regionAdmin.id);

    const before = await db.person.findUnique({ where: { id: president.id } });

    await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/reparent`)
      .set('Authorization', `Bearer ${regionAdminToken}`)
      .send({ newParentId: destDistrict.id })
      .expect(200);

    const after = await db.person.findUnique({ where: { id: president.id } });
    expect(after?.permissionVersion).toBe(before!.permissionVersion + 1);
  });
});
