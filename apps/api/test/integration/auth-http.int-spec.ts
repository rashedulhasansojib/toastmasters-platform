import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { jwtVerify } from 'jose';
import { getPrisma } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { AppModule } from '../../src/app.module';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { ClubMembershipRepository } from '../../src/modules/identity/club-membership.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PasswordService } from '../../src/common/auth/password.service';

function sessionCookieFrom(setCookieHeader: unknown): string {
  const cookies = setCookieHeader as string[];
  const raw = cookies.find((c) => c.startsWith('session='));
  if (!raw) throw new Error('No session cookie in Set-Cookie header');
  const [pair] = raw.split(';');
  return pair ?? raw;
}

function tokenFrom(cookiePair: string): string {
  return cookiePair.slice('session='.length);
}

describe('Login + session HTTP surface (integration)', () => {
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let app: INestApplication;
  const secret = 'b'.repeat(32);

  let clubId: string;
  let otherClubId: string;

  beforeAll(async () => {
    const { db, url: dbUrl, stop: stopDbContainer } = await startTestDb();
    const { url: redisUrl, stop: stopRedisContainer } = await startTestRedis();
    stopDb = stopDbContainer;
    stopRedis = stopRedisContainer;

    process.env.DATABASE_URL = dbUrl;
    process.env.DIRECT_URL = dbUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.SESSION_JWT_SECRET = secret;
    await db.$disconnect(); // this suite talks to the DB only through getPrisma()'s own singleton from here on

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
    const otherClub = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c2',
      name: 'Club 2',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    otherClubId = otherClub.id;

    const programYears = new ProgramYearRepository();
    await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    await getPrisma().programYear.update({
      where: { id: '2026-2027' },
      data: { status: 'current' },
    });

    const people = new PersonRepository();
    const passwords = new PasswordService();
    const person = await people.create({ email: 'login@example.com', fullName: 'Login Person' });
    await people.setCredentials(person.id, await passwords.hash('correct horse battery staple'));

    const clubMemberships = new ClubMembershipRepository();
    await clubMemberships.create({
      personId: person.id,
      clubUnitId: clubId,
      memberType: 'renewing',
      isPrimary: true,
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

  it('rejects a wrong password with 401 and sets no cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'login@example.com', password: 'wrong' })
      .expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login sets an httpOnly session cookie and returns no secret material', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'login@example.com', password: 'correct horse battery staple' })
      .expect(200);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((c) => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');

    expect(res.body).toEqual({
      personId: expect.any(String),
      fullName: 'Login Person',
      activeUnitId: clubId,
      programYearId: '2026-2027',
    });
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.token).toBeUndefined();
  });

  it('the session cookie is admitted by JwtAuthGuard, and switch-unit changes only activeUnitId', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'login@example.com', password: 'correct horse battery staple' })
      .expect(200);
    const sessionCookie = sessionCookieFrom(loginRes.headers['set-cookie']);
    const { payload: originalPayload } = await jwtVerify(
      tokenFrom(sessionCookie),
      new TextEncoder().encode(secret),
    );

    const switchRes = await request(app.getHttpServer())
      .post('/v1/auth/switch-unit')
      .set('Cookie', sessionCookie)
      .send({ orgUnitId: otherClubId })
      .expect(200);

    expect(switchRes.body.activeUnitId).toBe(otherClubId);
    expect(switchRes.body.programYearId).toBe(originalPayload.programYearId);

    const newSessionCookie = sessionCookieFrom(switchRes.headers['set-cookie']);
    const { payload: newPayload } = await jwtVerify(
      tokenFrom(newSessionCookie),
      new TextEncoder().encode(secret),
    );

    expect(newPayload.activeUnitId).toBe(otherClubId);
    expect(newPayload.programYearId).toBe(originalPayload.programYearId);
    expect(newPayload.v).toBe(originalPayload.v);
    expect(newPayload.sub).toBe(originalPayload.sub);
  });

  it('switch-unit without a session cookie is rejected before it ever reaches the handler', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/switch-unit')
      .send({ orgUnitId: otherClubId })
      .expect(401);
  });

  it('switch-unit to an unknown org unit 404s', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'login@example.com', password: 'correct horse battery staple' })
      .expect(200);
    const sessionCookie = sessionCookieFrom(loginRes.headers['set-cookie']);

    await request(app.getHttpServer())
      .post('/v1/auth/switch-unit')
      .set('Cookie', sessionCookie)
      .send({ orgUnitId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });
});
