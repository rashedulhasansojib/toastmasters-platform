import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { buildLoggerOptions } from '@toastmasters/logger';
import { parseEnv, redisConnectionOptions, type Env } from '@toastmasters/config';

// The worker is a long-running process; validate env once at module load.
const env: Env = parseEnv();

/**
 * Background job runner. BullMQ shares Redis with the API. Processors register
 * here as each milestone adds them (rollover, projections, digests, …). Phase 0
 * has none — the worker boots, connects, and idles.
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
  ],
})
export class AppModule {}
