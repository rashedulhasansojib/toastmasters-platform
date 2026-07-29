import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { SignJWT } from 'jose';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';

/**
 * The super-admin console's gate. The load-bearing assertion is the negative:
 * a `unit_admin` scoped at the *region root* — the most privileged non-super
 * admin the platform tier has — must still be refused, which is what proves
 * `platform.console` is reachable only through system_admin's broad
 * non-restricted synthesis and not through any role template.
 */
describe('Platform admin console HTTP surface (integration)', () => {
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
    // Booting the whole AppModule pulls in S3StorageAdapter, which throws at
    // construction when object storage is unconfigured. Nothing here touches
    // storage — these just have to be present for DI to resolve.
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

  it('200s system_admin and 403s a region-scoped unit_admin', async () => {
    const orgUnits = new OrgUnitRepository();
    const people = new PersonRepository();
    const access = new AccessRepository();
    const grantAdmin = new GrantAdminRepository(undefined, access);

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

    const sysAdmin = await people.create({
      email: 'console-sysadmin@example.com',
      fullName: 'Console Sys Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });

    const unitAdmin = await people.create({
      email: 'console-unitadmin@example.com',
      fullName: 'Console Unit Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: unitAdmin.id,
      role: 'unit_admin',
      orgUnitId: region.id,
      grantedBy: sysAdmin.id,
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

    const response = await request(app.getHttpServer())
      .get(`/v1/platform/${region.id}/console`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(200);

    expect(response.body.region.id).toBe(region.id);
    expect(response.body.counts.district).toBe(1);
    // Descendant-or-self: the region's own row must not be duplicated into the tree.
    expect(response.body.tree.map((u: { id: string }) => u.id)).toEqual([district.id]);

    await request(app.getHttpServer())
      .get(`/v1/platform/${region.id}/console`)
      .set('Authorization', `Bearer ${await jwtFor(unitAdmin.id)}`)
      .expect(403);

    await app.close();
  });
});
