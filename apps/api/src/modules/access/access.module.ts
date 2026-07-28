import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConnectionOptions, type Env } from '@toastmasters/config';
import { ENV } from '../../config/config.module';
import { AccessRepository } from './access.repository';
import { GrantAdminRepository } from './grant-admin.repository';
import { GrantCacheService } from './grant-cache.service';
import { REDIS_CLIENT } from './redis-client.token';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(redisConnectionOptions(env.REDIS_URL)),
    },
    GrantCacheService,
    AccessRepository,
    GrantAdminRepository,
  ],
  exports: [AccessRepository, GrantAdminRepository],
})
export class AccessModule {}
