import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { SignJWT } from 'jose';
import { getPrisma, seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';

/**
 * Users admin (super-admin People page). The load-bearing assertions are the
 * negative ones: a district-scoped unit_admin must not see a person only
 * placed in a sibling district (subtree isolation on search AND on the
 * single-person detail route, which has no list to filter — see
 * PersonService.getDetail's isWithinSubtree guard), and a club-tier role
 * assignment must upsert an active ClubMembership in the same call.
 */
describe('Users admin HTTP surface (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  const secret = 'a'.repeat(32);

  beforeAll(async () => {
    const { db, url: dbUrl, stop: stopDbContainer } = await startTestDb();
    const { url: redisUrl, stop: stopRedisContainer } = await startTestRedis();
    stopDb = stopDbContainer;
    stopRedis = stopRedisContainer;

    process.env.DATABASE_URL = dbUrl;
    process.env.DIRECT_URL = dbUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.SESSION_JWT_SECRET = secret;
    process.env.S3_ENDPOINT ??= 'http://localhost:9000';
    process.env.S3_BUCKET ??= 'toastmasters-test';
    process.env.S3_ACCESS_KEY_ID ??= 'minio';
    process.env.S3_SECRET_ACCESS_KEY ??= 'minio12345';

    await seedAccessVocabulary(db);
    await db.$disconnect();
  });

  afterAll(async () => {
    await stopDb();
    await stopRedis();
  });

  it('search isolates by subtree, a club-tier assignment upserts membership, and a director-tier assignment without membership warns', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const programYears = new ProgramYearRepository();
    const access = new AccessRepository();
    const grantAdmin = new GrantAdminRepository(undefined, access);

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const districtA = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'dA',
      name: 'District A',
      timezone: 'Asia/Dhaka',
    });
    const districtB = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'dB',
      name: 'District B',
      timezone: 'Asia/Dhaka',
    });
    const clubA = await orgUnits.createChild({
      parentId: districtA.id,
      type: 'club',
      code: 'cA',
      name: 'Club A',
      timezone: 'Asia/Dhaka',
    });
    const areaB = await orgUnits.createChild({
      parentId: districtB.id,
      type: 'area',
      code: 'areaB',
      name: 'Area B',
      timezone: 'Asia/Dhaka',
    });

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });

    const sysAdmin = await people.create({ email: 'sysadmin@example.com', fullName: 'Sys Admin' });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });

    const unitAdminA = await people.create({
      email: 'unitadmin-a@example.com',
      fullName: 'Unit Admin A',
    });
    await grantAdmin.grantPlatformRole({
      personId: unitAdminA.id,
      role: 'unit_admin',
      orgUnitId: districtA.id,
      grantedBy: sysAdmin.id,
    });

    const memberInClubA = await people.create({
      email: 'member-a@example.com',
      fullName: 'Member In Club A',
    });
    const directorInAreaB = await people.create({
      email: 'director-b@example.com',
      fullName: 'Director In Area B',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    const jwtFor = (personId: string) =>
      new SignJWT({ roles: [], scopes: [] })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(personId)
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(secret));

    // Club-tier assignment through the new general route upserts an active
    // ClubMembership alongside the RoleAssignment.
    const assignResponse = await request(app.getHttpServer())
      .post(`/v1/org-units/${clubA.id}/role-assignments`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .send({
        personId: memberInClubA.id,
        role: 'club_member',
        programYearId: year.id,
        termStart: '2026-07-01',
        termEnd: '2027-06-30',
        memberType: 'new',
      })
      .expect(201);
    expect(assignResponse.body.warnings).toEqual([]);

    const clubADetail = await request(app.getHttpServer())
      .get(`/v1/people/${memberInClubA.id}?anchorOrgUnitId=${region.id}`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(200);
    expect(clubADetail.body.clubMemberships).toHaveLength(1);
    expect(clubADetail.body.clubMemberships[0].localStatus).toBe('active');

    // Director-tier assignment with no active club membership: 200 + a
    // non-blocking warning (system-design.md §6.3
    // DirectorRequiresClubMembership), never a 4xx.
    const directorResponse = await request(app.getHttpServer())
      .post(`/v1/org-units/${areaB.id}/role-assignments`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .send({
        personId: directorInAreaB.id,
        role: 'area_director',
        programYearId: year.id,
        termStart: '2026-07-01',
        termEnd: '2027-06-30',
      })
      .expect(201);
    expect(directorResponse.body.warnings.length).toBeGreaterThan(0);

    // Subtree isolation: a District-A-scoped unit_admin's people search
    // (anchored at their own district) must not surface a person who only
    // exists in District B.
    const searchAsUnitAdminA = await request(app.getHttpServer())
      .get(`/v1/org-units/${districtA.id}/people`)
      .set('Authorization', `Bearer ${await jwtFor(unitAdminA.id)}`)
      .expect(200);
    const seenIds = searchAsUnitAdminA.body.items.map((p: { id: string }) => p.id);
    expect(seenIds).toContain(memberInClubA.id);
    expect(seenIds).not.toContain(directorInAreaB.id);

    // Same isolation on the single-person detail route: anchoring at their
    // own district must 404 (not 403 — existence itself isn't confirmed) a
    // person who only exists in the sibling district.
    await request(app.getHttpServer())
      .get(`/v1/people/${directorInAreaB.id}?anchorOrgUnitId=${districtA.id}`)
      .set('Authorization', `Bearer ${await jwtFor(unitAdminA.id)}`)
      .expect(404);

    // system_admin, anchored at the region root, sees everyone.
    const searchAsSysAdmin = await request(app.getHttpServer())
      .get(`/v1/org-units/${region.id}/people`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(200);
    const allSeenIds = searchAsSysAdmin.body.items.map((p: { id: string }) => p.id);
    expect(allSeenIds).toContain(memberInClubA.id);
    expect(allSeenIds).toContain(directorInAreaB.id);

    // A club officer (no identity.person grant at all) is a default-deny.
    const clubOfficer = await people.create({
      email: 'officer@example.com',
      fullName: 'Club Officer',
    });
    const { RoleAssignmentRepository } =
      await import('../../src/modules/identity/role-assignment.repository');
    await new RoleAssignmentRepository().assign({
      personId: clubOfficer.id,
      orgUnitId: clubA.id,
      role: 'club_president',
      programYearId: year.id,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: sysAdmin.id,
    });
    await request(app.getHttpServer())
      .get(`/v1/org-units/${clubA.id}/people`)
      .set('Authorization', `Bearer ${await jwtFor(clubOfficer.id)}`)
      .expect(403);

    await app.close();
  });

  /**
   * The gap this slice closes: granting/revoking a platform role
   * (system_admin / unit_admin / support_readonly) had no HTTP surface at
   * all. The load-bearing assertion is the 403 — an ordinary club officer
   * (or even a district-scoped unit_admin, which holds no
   * access.platform_role grant) must not be able to mint themselves or
   * anyone else a platform role.
   */
  it('a system_admin grants and revokes a platform role over HTTP; anyone else gets 403', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const access = new AccessRepository();
    const grantAdmin = new GrantAdminRepository(undefined, access);

    // `org_unit_single_region_root` allows exactly one 'region' row per
    // deployment (CLAUDE.md §2 decision 6) — reuse it if an earlier test in
    // this file already created one, rather than assuming test order.
    const region =
      (await getPrisma().orgUnit.findFirst({ where: { type: 'region' } })) ??
      (await orgUnits.createRoot({
        type: 'region',
        code: 'r1',
        name: 'Region 1',
        timezone: 'Asia/Dhaka',
      }));
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd2',
      name: 'District 2',
      timezone: 'Asia/Dhaka',
    });

    const sysAdmin = await people.create({
      email: 'sysadmin-grant@example.com',
      fullName: 'Sys Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });
    const unitAdmin = await people.create({
      email: 'unitadmin-grant@example.com',
      fullName: 'Unit Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: unitAdmin.id,
      role: 'unit_admin',
      orgUnitId: district.id,
      grantedBy: sysAdmin.id,
    });
    const newcomer = await people.create({
      email: 'newcomer-grant@example.com',
      fullName: 'Newcomer',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    const jwtFor = (personId: string) =>
      new SignJWT({ roles: [], scopes: [] })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(personId)
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(secret));

    // A unit_admin — a real platform role, but not system_admin — cannot
    // grant a platform role: access.platform_role isn't in its seeded grant
    // list, only system_admin's broad non-restricted synthesis holds it.
    await request(app.getHttpServer())
      .post(`/v1/people/${newcomer.id}/platform-roles`)
      .set('Authorization', `Bearer ${await jwtFor(unitAdmin.id)}`)
      .send({ role: 'system_admin' })
      .expect(403);

    // system_admin grants system_admin to someone else.
    const grantResponse = await request(app.getHttpServer())
      .post(`/v1/people/${newcomer.id}/platform-roles`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .send({ role: 'system_admin' })
      .expect(201);
    expect(grantResponse.body).toMatchObject({ role: 'system_admin', orgUnitId: null });

    const detail = await request(app.getHttpServer())
      .get(`/v1/people/${newcomer.id}?anchorOrgUnitId=${region.id}`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(200);
    expect(detail.body.platformRoles).toContainEqual(
      expect.objectContaining({ role: 'system_admin' }),
    );

    // system_admin is global — scoping it to an org unit is a 400, not a
    // silently-ignored field.
    await request(app.getHttpServer())
      .post(`/v1/people/${newcomer.id}/platform-roles`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .send({ role: 'system_admin', orgUnitId: district.id })
      .expect(400);

    // The same unauthorized unit_admin cannot revoke it either.
    const platformRoleAssignmentId = grantResponse.body.platformRoleAssignmentId;
    await request(app.getHttpServer())
      .delete(`/v1/people/${newcomer.id}/platform-roles/${platformRoleAssignmentId}`)
      .set('Authorization', `Bearer ${await jwtFor(unitAdmin.id)}`)
      .expect(403);

    // system_admin revokes it.
    await request(app.getHttpServer())
      .delete(`/v1/people/${newcomer.id}/platform-roles/${platformRoleAssignmentId}`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(204);

    const detailAfterRevoke = await request(app.getHttpServer())
      .get(`/v1/people/${newcomer.id}?anchorOrgUnitId=${region.id}`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(200);
    expect(detailAfterRevoke.body.platformRoles).toEqual([]);

    await app.close();
  });
});
