import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { buildLoggerOptions } from '@toastmasters/logger';
import { redisConnectionOptions, type Env } from '@toastmasters/config';
import { ConfigModule, ENV } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './common/auth/auth.module';
import { AuthzModule } from './common/authz/authz.module';
import { EmailModule } from './common/email/email.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { ResourceGuard } from './common/authz/resource.guard';
import { MeetingModule } from './modules/meeting/meeting.module';
import { MembershipModule } from './modules/membership/membership.module';
import { FinanceModule } from './modules/finance/finance.module';
import { LibraryModule } from './modules/library/library.module';
import { OperationsModule } from './modules/operations/operations.module';
import { QualityModule } from './modules/quality/quality.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { EducationModule } from './modules/education/education.module';
import { SupportModule } from './modules/support/support.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: buildLoggerOptions({
          level: env.LOG_LEVEL,
          pretty: env.NODE_ENV === 'development',
        }),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ connection: redisConnectionOptions(env.REDIS_URL) }),
    }),
    AuthModule,
    AuthzModule,
    EmailModule,
    HealthModule,
    MeetingModule,
    MembershipModule,
    FinanceModule,
    LibraryModule,
    OperationsModule,
    QualityModule,
    GovernanceModule,
    EducationModule,
    SupportModule,
  ],
  // Global guard chain: authenticate first (JwtAuthGuard), then authorize
  // (ResourceGuard). Both honour @Public(). Default-deny everywhere else.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ResourceGuard },
  ],
})
export class AppModule {}
