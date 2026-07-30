import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Grant } from '../../common/authz/authz.types';
import { REDIS_CLIENT } from './redis-client.token';

const TTL_SECONDS = 5 * 60;

/** rbac-design.md §5: resolved grant set, 5 min TTL, keyed personId:permissionVersion. */
@Injectable()
export class GrantCacheService {
  // Redis is disabled at the module level (free-plan quota exhausted), so
  // this is always null in the current deployment. get() always misses and
  // set() no-ops; AccessRepository then resolves grants against Postgres on
  // every call. Re-enable in AccessModule when the quota is restored.
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  private key(personId: string, permissionVersion: number): string {
    return `access:grants:${personId}:${permissionVersion}`;
  }

  async get(personId: string, permissionVersion: number): Promise<Grant[] | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get(this.key(personId, permissionVersion));
    return raw ? (JSON.parse(raw) as Grant[]) : null;
  }

  async set(personId: string, permissionVersion: number, grants: Grant[]): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(
      this.key(personId, permissionVersion),
      JSON.stringify(grants),
      'EX',
      TTL_SECONDS,
    );
  }
}
