import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { getPrisma } from '@toastmasters/db';
import { redisConnectionOptions, type Env } from '@toastmasters/config';
import { ENV } from '../../config/config.module';
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
      inject: [ENV],
      useFactory: (env: Env) => new Redis(redisConnectionOptions(env.REDIS_URL)),
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
