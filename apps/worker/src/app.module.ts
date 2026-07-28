import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { buildLoggerOptions } from '@toastmasters/logger';
import { parseEnv, redisConnectionOptions, type Env } from '@toastmasters/config';
import { PROSPECT_RETENTION_QUEUE } from './processors/prospect-retention.processor';
import { ProspectRetentionProcessor } from './processors/prospect-retention.processor';
import { ProspectRetentionScheduler } from './processors/prospect-retention.scheduler';

// The worker is a long-running process; validate env once at module load.
const env: Env = parseEnv();

/**
 * Background job runner. BullMQ shares Redis with the API. Processors register
 * here as each milestone adds them (rollover, projections, digests, …). M4
 * Slice 3 adds the first one: nightly prospect PII retention.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: buildLoggerOptions({
        level: env.LOG_LEVEL,
        pretty: env.NODE_ENV === 'development',
      }),
    }),
    BullModule.forRoot({ connection: redisConnectionOptions(env.REDIS_URL) }),
    BullModule.registerQueue({ name: PROSPECT_RETENTION_QUEUE }),
  ],
  providers: [ProspectRetentionProcessor, ProspectRetentionScheduler],
})
export class AppModule {}
