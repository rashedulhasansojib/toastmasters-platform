import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../access/redis-client.token';

const DAILY_LIMIT = 20;
const WINDOW_SECONDS = 24 * 60 * 60;

/** FR-ACC-10: invitation creation is rate-limited per inviter. A flat daily cap — no design doc gives a number, so this is a hardcoded, unconfigurable ceiling. */
@Injectable()
export class InvitationRateLimiter {
  // Redis is disabled at the module level (free-plan quota exhausted), so
  // this is always null in the current deployment and the rate check below
  // is skipped. Re-enable in AccessModule when the quota is restored.
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async checkAndIncrement(inviterId: string): Promise<void> {
    if (!this.redis) return;
    const key = `invitation:rate:${inviterId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
    if (count > DAILY_LIMIT) {
      throw new HttpException('Too many invitations sent today', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
