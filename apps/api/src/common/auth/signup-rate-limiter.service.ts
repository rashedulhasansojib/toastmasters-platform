import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Caps the public sandbox-signup endpoint per IP. In-memory rather than
 * Redis-backed like InvitationRateLimiter — Redis is disabled repo-wide
 * (free-plan quota exhausted, see InvitationRateLimiter's comment), so a
 * Redis-shaped limiter here would silently no-op just like that one does.
 * Per-process only: resets on restart and isn't shared across API
 * instances — an accepted limitation given this endpoint's low blast radius.
 */
@Injectable()
export class SignupRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  checkAndIncrement(ip: string): void {
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    entry.count += 1;
    if (entry.count > LIMIT) {
      throw new HttpException('Too many signups from this address', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
