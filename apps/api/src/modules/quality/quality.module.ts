import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { AreaVisitReportRepository } from './area-visit-report.repository';
import { AreaVisitReportController } from './area-visit-report.controller';
import { PresidentContactLogRepository } from './president-contact-log.repository';
import { PresidentContactLogController } from './president-contact-log.controller';
import { DcpProjectionRepository } from './dcp-projection.repository';
import { DcpProjectionController } from './dcp-projection.controller';
import { ClubHealthSnapshotRepository } from './club-health-snapshot.repository';
import { ClubHealthSnapshotController } from './club-health-snapshot.controller';
import { TicketRepository } from './ticket.repository';
import { TicketController } from './ticket.controller';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    AreaVisitReportRepository,
    PresidentContactLogRepository,
    DcpProjectionRepository,
    ClubHealthSnapshotRepository,
    TicketRepository,
  ],
  controllers: [
    AreaVisitReportController,
    PresidentContactLogController,
    DcpProjectionController,
    ClubHealthSnapshotController,
    TicketController,
  ],
  exports: [AreaVisitReportRepository, DcpProjectionRepository],
})
export class QualityModule {}
