import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { buildLoggerOptions } from '@toastmasters/logger';
import { parseEnv, redisConnectionOptions, type Env } from '@toastmasters/config';
import { GUEST_RETENTION_QUEUE } from './processors/guest-retention.processor';
import { GuestRetentionProcessor } from './processors/guest-retention.processor';
import { GuestRetentionScheduler } from './processors/guest-retention.scheduler';
import { DCP_PROJECTION_QUEUE } from './processors/dcp-projection.processor';
import { DcpProjectionProcessor } from './processors/dcp-projection.processor';
import { DcpProjectionScheduler } from './processors/dcp-projection.scheduler';
import { CLUB_HEALTH_SNAPSHOT_QUEUE } from './processors/club-health-snapshot.processor';
import { ClubHealthSnapshotProcessor } from './processors/club-health-snapshot.processor';
import { ClubHealthSnapshotScheduler } from './processors/club-health-snapshot.scheduler';
import { MEMBER_HEALTH_SIGNAL_QUEUE } from './processors/member-health-signal.processor';
import { MemberHealthSignalProcessor } from './processors/member-health-signal.processor';
import { MemberHealthSignalScheduler } from './processors/member-health-signal.scheduler';

// The worker is a long-running process; validate env once at module load.
const env: Env = parseEnv();

/**
 * Background job runner. BullMQ shares Redis with the API. Processors register
 * here as each milestone adds them (rollover, projections, digests, …). M4
 * Slice 3 adds the first one: nightly guest PII retention.
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
    BullModule.registerQueue({ name: GUEST_RETENTION_QUEUE }),
    BullModule.registerQueue({ name: DCP_PROJECTION_QUEUE }),
    BullModule.registerQueue({ name: CLUB_HEALTH_SNAPSHOT_QUEUE }),
    BullModule.registerQueue({ name: MEMBER_HEALTH_SIGNAL_QUEUE }),
  ],
  providers: [
    GuestRetentionProcessor,
    GuestRetentionScheduler,
    DcpProjectionProcessor,
    DcpProjectionScheduler,
    ClubHealthSnapshotProcessor,
    ClubHealthSnapshotScheduler,
    MemberHealthSignalProcessor,
    MemberHealthSignalScheduler,
  ],
})
export class AppModule {}
