import { describe, it, expect } from 'vitest';
import { parseEnv } from './env';
import { redisConnectionOptions } from './redis';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  DIRECT_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults for optional values', () => {
    const env = parseEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('splits CORS_ORIGINS into a trimmed array', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'https://a.test, https://b.test ,' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('coerces numeric ports from strings', () => {
    const env = parseEnv({ ...base, API_PORT: '5555' });
    expect(env.API_PORT).toBe(5555);
  });

  it('throws when a required variable is missing', () => {
    const { DATABASE_URL: _omit, ...withoutDb } = base;
    expect(() => parseEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('rejects a too-short session secret', () => {
    expect(() => parseEnv({ ...base, SESSION_JWT_SECRET: 'short' })).toThrow(/SESSION_JWT_SECRET/);
  });
});

describe('redisConnectionOptions', () => {
  it('parses host, port and credentials', () => {
    const opts = redisConnectionOptions('redis://user:secret@redis.example:6380');
    expect(opts).toMatchObject({
      host: 'redis.example',
      port: 6380,
      username: 'user',
      password: 'secret',
    });
    expect(opts.tls).toBeUndefined();
  });

  it('enables TLS for rediss:// urls and defaults the port', () => {
    const opts = redisConnectionOptions('rediss://redis.example');
    expect(opts.port).toBe(6379);
    expect(opts.tls).toEqual({});
  });
});
