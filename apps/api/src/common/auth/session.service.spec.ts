import { describe, it, expect } from 'vitest';
import { jwtVerify } from 'jose';
import type { Env } from '@toastmasters/config';
import { SessionService } from './session.service';

const env = {
  SESSION_JWT_SECRET: 'a'.repeat(32),
  SESSION_TTL_SECONDS: 3600,
  NODE_ENV: 'test',
} as Env;

describe('SessionService', () => {
  const service = new SessionService(env);

  it('issues a JWT whose claims round-trip through jose verification', async () => {
    const token = await service.issue({
      sub: 'person-1',
      activeUnitId: 'club-1',
      programYearId: '2026-2027',
      v: 3,
    });

    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SESSION_JWT_SECRET));
    expect(payload.sub).toBe('person-1');
    expect(payload.activeUnitId).toBe('club-1');
    expect(payload.programYearId).toBe('2026-2027');
    expect(payload.v).toBe(3);
    expect(payload.roles).toEqual([]);
    expect(payload.scopes).toEqual([]);
  });

  it('round-trips null activeUnitId/programYearId', async () => {
    const token = await service.issue({
      sub: 'person-2',
      activeUnitId: null,
      programYearId: null,
      v: 1,
    });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SESSION_JWT_SECRET));
    expect(payload.activeUnitId).toBeNull();
    expect(payload.programYearId).toBeNull();
  });

  it('cookieOptions is httpOnly and not secure outside production', () => {
    const options = service.cookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(false);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(3600 * 1000);
  });

  it('cookieOptions is secure in production', () => {
    const prodService = new SessionService({ ...env, NODE_ENV: 'production' } as Env);
    expect(prodService.cookieOptions().secure).toBe(true);
  });
});
