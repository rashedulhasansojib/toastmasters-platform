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
import { REDIS_CLIENT } from './redis-client.token';
import { PRISMA_CLIENT } from './prisma-client.token';

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
  ],
  controllers: [AccessInspectorController],
  exports: [AccessRepository, GrantAdminRepository, AccessInspectorRepository],
})
export class AccessModule {}
