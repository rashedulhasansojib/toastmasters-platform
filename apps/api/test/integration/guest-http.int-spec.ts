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
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';

/** M4 Slice 1: the guest pipeline. */
describe('M4 Slice 1: guest pipeline (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'e'.repeat(32);

  let clubId: string;
  let clubBId: string;
  let programYearId: string;
  let vpmId: string;
  let outsiderId: string;
  let sysAdminId: string;

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
    process.env.S3_ENDPOINT ??= 'http://localhost:9000';
    process.env.S3_BUCKET ??= 'toastmasters-test';
    process.env.S3_ACCESS_KEY_ID ??= 'minio';
    process.env.S3_SECRET_ACCESS_KEY ??= 'minio12345';
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
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c2',
      name: 'Club 2',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubBId = clubB.id;

    const programYears = new ProgramYearRepository();
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const people = new PersonRepository();
    const roleAssignments = new RoleAssignmentRepository();
    const vpm = await people.create({ email: 'vpm@example.com', fullName: 'VPM' });
    vpmId = vpm.id;
    await roleAssignments.assign({
      personId: vpm.id,
      orgUnitId: clubId,
      role: 'club_vpm',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: vpm.id,
    });

    const outsider = await people.create({
      email: 'outsider@example.com',
      fullName: 'Outsider',
    });
    outsiderId = outsider.id;
    await roleAssignments.assign({
      personId: outsider.id,
      orgUnitId: clubBId,
      role: 'club_member',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: outsider.id,
    });

    // A system_admin has synthesised update/delete on membership.guest, so
    // they clear the RBAC gate — which is exactly what makes them useful for
    // exercising the controller-level filer-only check.
    const access = new AccessRepository(db);
    const grantAdmin = new GrantAdminRepository(db, access);
    const sysAdmin = await people.create({
      email: 'sysadmin@example.com',
      fullName: 'System Admin',
    });
    sysAdminId = sysAdmin.id;
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
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

  it('a club_vpm creates a guest — pipelineStatus defaults to new, deleteAfter is ~180 days out', async () => {
    const token = await jwtFor(vpmId);
    const res = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Jordan Guest', email: 'jordan@example.com' })
      .expect(201);

    expect(res.body.pipelineStatus).toBe('new');
    const days = (new Date(res.body.deleteAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(179);
    expect(days).toBeLessThan(181);
  });

  it('a club_vpm updates pipelineStatus to interested; setting it to joined directly is rejected', async () => {
    const token = await jwtFor(vpmId);
    const created = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Casey Guest' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/clubs/${clubId}/guests/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pipelineStatus: 'interested' })
      .expect(200)
      .expect((res) => {
        if (res.body.pipelineStatus !== 'interested') throw new Error('status did not update');
      });

    await request(app.getHttpServer())
      .patch(`/v1/clubs/${clubId}/guests/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pipelineStatus: 'joined' })
      .expect(400);
  });

  it('a member of a different club is denied — sibling-club isolation', async () => {
    const token = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Attempted intrusion' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/guests`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('the filer can edit and delete their own contact-log entry; a passer-by with RBAC access still cannot', async () => {
    const vpmToken = await jwtFor(vpmId);
    const guestRes = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/guests`)
      .set('Authorization', `Bearer ${vpmToken}`)
      .send({ fullName: 'Contact-log Guest' })
      .expect(201);
    const guestId = guestRes.body.id;

    const created = await request(app.getHttpServer())
      .post(`/v1/clubs/${clubId}/guests/${guestId}/communications`)
      .set('Authorization', `Bearer ${vpmToken}`)
      .send({ channel: 'call', note: 'initial call' })
      .expect(201);
    const commId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/v1/clubs/${clubId}/guests/${guestId}/communications/${commId}`)
      .set('Authorization', `Bearer ${vpmToken}`)
      .send({ note: 'corrected note' })
      .expect(200)
      .expect((res) => {
        if (res.body.note !== 'corrected note') throw new Error('note did not update');
      });

    // system_admin clears the RBAC gate but is not the filer — the
    // controller-level filer check must still reject them.
    const sysToken = await jwtFor(sysAdminId);
    await request(app.getHttpServer())
      .patch(`/v1/clubs/${clubId}/guests/${guestId}/communications/${commId}`)
      .set('Authorization', `Bearer ${sysToken}`)
      .send({ note: 'not the filer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/v1/clubs/${clubId}/guests/${guestId}/communications/${commId}`)
      .set('Authorization', `Bearer ${sysToken}`)
      .expect(403);

    // A different club's member is denied at the RBAC layer, not the filer check.
    const outsiderToken = await jwtFor(outsiderId);
    await request(app.getHttpServer())
      .patch(`/v1/clubs/${clubId}/guests/${guestId}/communications/${commId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ note: 'from another club' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/v1/clubs/${clubId}/guests/${guestId}/communications/${commId}`)
      .set('Authorization', `Bearer ${vpmToken}`)
      .expect(204);

    const after = await request(app.getHttpServer())
      .get(`/v1/clubs/${clubId}/guests/${guestId}/communications`)
      .set('Authorization', `Bearer ${vpmToken}`)
      .expect(200);
    if (after.body.some((e: { id: string }) => e.id === commId)) {
      throw new Error('deleted entry still visible');
    }
  });
});
