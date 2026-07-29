import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { OrgModule } from '../org/org.module';
import { AreaVisitReportRepository } from './area-visit-report.repository';
import { AreaVisitReportController } from './area-visit-report.controller';
import { AreaDashboardController } from './area-dashboard.controller';
import { PresidentContactLogRepository } from './president-contact-log.repository';
import { PresidentContactLogController } from './president-contact-log.controller';
import { DcpProjectionRepository } from './dcp-projection.repository';
import { DcpProjectionController } from './dcp-projection.controller';
import { ClubHealthSnapshotRepository } from './club-health-snapshot.repository';
import { ClubHealthSnapshotController } from './club-health-snapshot.controller';
import { TicketRepository } from './ticket.repository';
import { TicketController } from './ticket.controller';

@Module({
  imports: [OrgModule],
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
    AreaDashboardController,
    PresidentContactLogController,
    DcpProjectionController,
    ClubHealthSnapshotController,
    TicketController,
  ],
  exports: [AreaVisitReportRepository, DcpProjectionRepository],
})
export class QualityModule {}
