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
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';

/**
 * M2 Slice 3 (prd.md FR-AUTHZ-9/10): unit policy overrides over HTTP. Real
 * Postgres + Redis, the real AppModule, real HTTP routes.
 */
describe('M2 Slice 3: unit policy overrides (integration)', () => {
  let db: PrismaClient;
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'f'.repeat(32);

  let regionId: string;
  let programYearId: string;

  const jwtFor = (personId: string) =>
    new SignJWT({ roles: [], scopes: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(personId)
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret));

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

  it('unit_admin creates an allow override for a capability it holds', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();

    const club = await orgUnits.createChild({
      parentId: regionId,
      type: 'club',
      code: 'c-allow',
      name: 'Club Allow',
      timezone: 'UTC',
    });
    const admin = await people.create({ email: 'policy-admin@example.com', fullName: 'Admin' });
    await grantAdmin.grantPlatformRole({
      personId: admin.id,
      role: 'unit_admin',
      orgUnitId: club.id,
      grantedBy: admin.id,
    });
    const adminToken = await jwtFor(admin.id);

    const res = await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/unit-policies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectRole: 'club_member',
        resource: 'identity.role_assignment', // unit_admin holds :create itself
        action: 'create',
        effect: 'allow',
        reason: 'let members co-appoint officers this term',
      })
      .expect(201);
    expect(res.body.effect).toBe('allow');
    expect(res.body.subjectRole).toBe('club_member');
    expect(res.body.expiresAt).toBeNull();
  });

  it('denies an allow override for a capability the actor does not hold — the escalation case', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const grantAdmin = new GrantAdminRepository();

    const club = await orgUnits.createChild({
      parentId: regionId,
      type: 'club',
      code: 'c-escalate',
      name: 'Club Escalate',
      timezone: 'UTC',
    });
    const member = await people.create({
      email: 'escalating-member@example.com',
      fullName: 'Escalating Member',
    });
    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: club.id,
      role: 'club_member', // no org.unit access at all
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: member.id,
    });
    // Crafted override: this member can create unit-policy overrides, but
    // holds nothing on org.unit — the exact "holds invitation/policy-create
    // but not the thing being delegated" shape Slice 1's escalation test used.
    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: club.id,
      subjectRole: 'club_member',
      resource: 'access.unit_policy',
      action: 'create',
      effect: 'allow',
      createdBy: member.id,
      reason: 'test fixture',
    });
    const memberToken = await jwtFor(member.id);

    const before = await db.unitPolicyGrant.count({
      where: { orgUnitId: club.id, resource: 'org.unit' },
    });
    await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/unit-policies`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        subjectRole: 'club_member',
        resource: 'org.unit',
        action: 'update',
        effect: 'allow',
        reason: 'attempted escalation',
      })
      .expect(403);
    const after = await db.unitPolicyGrant.count({
      where: { orgUnitId: club.id, resource: 'org.unit' },
    });
    expect(after).toBe(before);
  });

  it('allows a deny override even when the actor holds nothing on that resource', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const grantAdmin = new GrantAdminRepository();

    const club = await orgUnits.createChild({
      parentId: regionId,
      type: 'club',
      code: 'c-deny-exempt',
      name: 'Club Deny Exempt',
      timezone: 'UTC',
    });
    const member = await people.create({
      email: 'deny-member@example.com',
      fullName: 'Deny Member',
    });
    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: club.id,
      role: 'club_member',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: member.id,
    });
    await grantAdmin.createUnitPolicyGrant({
      orgUnitId: club.id,
      subjectRole: 'club_member',
      resource: 'access.unit_policy',
      action: 'create',
      effect: 'allow',
      createdBy: member.id,
      reason: 'test fixture',
    });
    const memberToken = await jwtFor(member.id);

    // This member holds no finance.ledger access of any kind, yet may deny
    // the treasurer's own ledger access — denial can never be an escalation.
    await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/unit-policies`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        subjectRole: 'club_treasurer',
        resource: 'finance.ledger',
        action: 'read',
        effect: 'deny',
        reason: 'club policy: ledger review suspended this term',
      })
      .expect(201);
  });

  it('the last-unit_admin guard blocks a self-deny of access.unit_policy:create, and allows it once a second unit_admin exists', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();

    const club = await orgUnits.createChild({
      parentId: regionId,
      type: 'club',
      code: 'c-last-admin',
      name: 'Club Last Admin',
      timezone: 'UTC',
    });
    const solo = await people.create({ email: 'solo-admin@example.com', fullName: 'Solo Admin' });
    await grantAdmin.grantPlatformRole({
      personId: solo.id,
      role: 'unit_admin',
      orgUnitId: club.id,
      grantedBy: solo.id,
    });
    const soloToken = await jwtFor(solo.id);

    await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/unit-policies`)
      .set('Authorization', `Bearer ${soloToken}`)
      .send({
        subjectRole: 'unit_admin',
        resource: 'access.unit_policy',
        action: 'create',
        effect: 'deny',
        reason: 'attempted self-lockout',
      })
      .expect(403);

    const second = await people.create({
      email: 'second-admin@example.com',
      fullName: 'Second Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: second.id,
      role: 'unit_admin',
      orgUnitId: club.id,
      grantedBy: solo.id,
    });

    await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/unit-policies`)
      .set('Authorization', `Bearer ${soloToken}`)
      .send({
        subjectRole: 'unit_admin',
        resource: 'access.unit_policy',
        action: 'create',
        effect: 'deny',
        reason: 'now safe: a second unit_admin remains',
      })
      .expect(201);
  });

  it('creation is not blocked by an already-past expiresAt', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const grantAdmin = new GrantAdminRepository();

    const club = await orgUnits.createChild({
      parentId: regionId,
      type: 'club',
      code: 'c-expired',
      name: 'Club Expired',
      timezone: 'UTC',
    });
    const admin = await people.create({
      email: 'expiry-admin@example.com',
      fullName: 'Expiry Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: admin.id,
      role: 'unit_admin',
      orgUnitId: club.id,
      grantedBy: admin.id,
    });
    const adminToken = await jwtFor(admin.id);

    const res = await request(app.getHttpServer())
      .post(`/v1/org-units/${club.id}/unit-policies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectRole: 'club_member',
        resource: 'identity.role_assignment',
        action: 'create',
        effect: 'allow',
        reason: 'already-lapsed override',
        expiresAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);
    expect(res.body.expiresAt).toBe('2020-01-01T00:00:00.000Z');
  });
});
