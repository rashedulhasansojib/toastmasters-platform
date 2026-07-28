import { describe, it, expect, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { InvitationRateLimiter } from './invitation-rate-limiter.service';

function makeRedis(counts: Record<string, number> = {}) {
  const store = new Map(Object.entries(counts));
  return {
    incr: vi.fn().mockImplementation(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn().mockResolvedValue(1),
  };
}

describe('InvitationRateLimiter', () => {
  it('allows the first 20 invitations for an inviter in a day', async () => {
    const redis = makeRedis();
    const limiter = new InvitationRateLimiter(redis as never);

    for (let i = 0; i < 20; i++) {
      await expect(limiter.checkAndIncrement('inviter-1')).resolves.toBeUndefined();
    }
    expect(redis.expire).toHaveBeenCalledOnce(); // only set on the first increment
  });

  it('rejects the 21st invitation for the same inviter on the same day', async () => {
    const redis = makeRedis();
    const limiter = new InvitationRateLimiter(redis as never);

    for (let i = 0; i < 20; i++) await limiter.checkAndIncrement('inviter-1');
    await expect(limiter.checkAndIncrement('inviter-1')).rejects.toThrow(HttpException);
  });

  it('tracks different inviters independently', async () => {
    const redis = makeRedis();
    const limiter = new InvitationRateLimiter(redis as never);

    for (let i = 0; i < 20; i++) await limiter.checkAndIncrement('inviter-1');
    await expect(limiter.checkAndIncrement('inviter-2')).resolves.toBeUndefined();
  });
});
