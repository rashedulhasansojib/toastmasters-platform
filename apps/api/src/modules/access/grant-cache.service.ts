import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Grant } from '../../common/authz/authz.types';
import { REDIS_CLIENT } from './redis-client.token';

const TTL_SECONDS = 5 * 60;

/** rbac-design.md §5: resolved grant set, 5 min TTL, keyed personId:permissionVersion. */
@Injectable()
export class GrantCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(personId: string, permissionVersion: number): string {
    return `access:grants:${personId}:${permissionVersion}`;
  }

  async get(personId: string, permissionVersion: number): Promise<Grant[] | null> {
    const raw = await this.redis.get(this.key(personId, permissionVersion));
    return raw ? (JSON.parse(raw) as Grant[]) : null;
  }

  async set(personId: string, permissionVersion: number, grants: Grant[]): Promise<void> {
    await this.redis.set(
      this.key(personId, permissionVersion),
      JSON.stringify(grants),
      'EX',
      TTL_SECONDS,
    );
  }
}
