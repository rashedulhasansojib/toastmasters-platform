import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { AccessRepository } from './access.repository';
import { GrantAdminRepository } from './grant-admin.repository';
import { GrantCacheService } from './grant-cache.service';
import { AccessInspectorRepository } from './access-inspector.repository';
import { AccessInspectorController } from './access-inspector.controller';
import { UnitPolicyService } from './unit-policy.service';
import { UnitPolicyController } from './unit-policy.controller';
import { REDIS_CLIENT } from './redis-client.token';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    {
      provide: REDIS_CLIENT,
      // Redis is disabled in code — the free plan's quota is exhausted, so
      // even when REDIS_URL is set we do not open a connection.
      // GrantCacheService and InvitationRateLimiter guard on this null and
      // no-op. To re-enable: restore the ioredis factory that reads
      // env.REDIS_URL via redisConnectionOptions() from @toastmasters/config.
      useValue: null,
    },
    GrantCacheService,
    AccessRepository,
    GrantAdminRepository,
    AccessInspectorRepository,
    UnitPolicyService,
  ],
  controllers: [AccessInspectorController, UnitPolicyController],
  // REDIS_CLIENT is exported so other modules (e.g. identity's invitation
  // rate limiter) reuse this one connection instead of opening a second.
  exports: [AccessRepository, GrantAdminRepository, AccessInspectorRepository, REDIS_CLIENT],
})
export class AccessModule {}
