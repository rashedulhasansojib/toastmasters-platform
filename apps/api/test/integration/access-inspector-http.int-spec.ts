import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { SignJWT } from 'jose';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { ConfigModule } from '../../src/config/config.module';
import { AccessModule } from '../../src/modules/access/access.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';

/**
 * This suite boots the real app (or, for the first assertion, just
 * AccessModule) through NestJS's actual DI container against real
 * Testcontainers Postgres + Redis — the DB/env-independent gap that let the
 * PRISMA_CLIENT dependency-resolution bug (see the Slice 7 plan) go
 * undetected since Slice 4. Every other integration test constructs
 * repositories manually and never exercises this path.
 */
describe('Access inspector HTTP surface (integration)', () => {
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

    await seedAccessVocabulary(db);
    await db.$disconnect(); // this suite talks to the DB only through getPrisma()'s own singleton from here on
  });

  afterAll(async () => {
    await stopDb();
    await stopRedis();
  });

  it('boots AccessModule through real Nest DI without a dependency-resolution error', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, AccessModule],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('200s an actor holding platform.audit:read at the region root, 403s one who does not', async () => {
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

    const sysAdmin = await people.create({
      email: 'http-sysadmin@example.com',
      fullName: 'HTTP Sys Admin',
    });
    await grantAdmin.grantPlatformRole({
      personId: sysAdmin.id,
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: sysAdmin.id,
    });
    // platform.audit is itself restricted (Slice 6): even system_admin needs
    // break-glass to read it, including through the inspector.
    await grantAdmin.mintBreakGlass({
      systemAdminPersonId: sysAdmin.id,
      orgUnitId: region.id,
      resource: 'platform.audit',
      action: 'read',
      reason: 'HTTP inspector test',
    });

    const plainMember = await people.create({
      email: 'http-member@example.com',
      fullName: 'HTTP Member',
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

    const query = `resource=finance.ledger&action=read&scope=${encodeURIComponent(region.path)}`;

    await request(app.getHttpServer())
      .get(`/v1/access/inspector/who-can-access?${query}`)
      .set('Authorization', `Bearer ${await jwtFor(sysAdmin.id)}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/access/inspector/who-can-access?${query}`)
      .set('Authorization', `Bearer ${await jwtFor(plainMember.id)}`)
      .expect(403);

    await app.close();
  });
});
