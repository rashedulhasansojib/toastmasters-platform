import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AreaDashboardResponse } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { OrgUnitRepository } from '../org/org.repository';
import { AreaVisitReportRepository } from './area-visit-report.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M6 Slice 7: FR-OVS-6 — leads with visit compliance, not attendance. "An Area dashboard that shows attendance but not compliance has missed the job." */
@Controller('areas/:areaUnitId/dashboard')
export class AreaDashboardController {
  constructor(
    private readonly orgUnits: OrgUnitRepository,
    private readonly visitReports: AreaVisitReportRepository,
  ) {}

  @Get()
  @ResourceScope('quality.area_visit_report', 'read', { source: 'param', key: 'areaUnitId' })
  async get(
    @Param('areaUnitId', uuidPipe) areaUnitId: string,
    @Query('programYearId') programYearId: string,
  ): Promise<AreaDashboardResponse> {
    const area = await this.orgUnits.findById(areaUnitId);
    if (!area) throw new NotFoundException('Area not found');

    const subtree = await this.orgUnits.findSubtree(area.path);
    const clubs = subtree.filter((u) => u.type === 'club');

    const clubStatuses = await Promise.all(
      clubs.map(async (club) => {
        const reports = await this.visitReports.findByClub(club.id);
        const r1Submitted = reports.some(
          (r) => r.programYearId === programYearId && r.round === 'R1' && r.status === 'submitted',
        );
        const r2Submitted = reports.some(
          (r) => r.programYearId === programYearId && r.round === 'R2' && r.status === 'submitted',
        );
        return { clubUnitId: club.id, clubName: club.name, r1Submitted, r2Submitted };
      }),
    );

    const totalClubs = clubs.length;
    const r1Count = clubStatuses.filter((c) => c.r1Submitted).length;
    const r2Count = clubStatuses.filter((c) => c.r2Submitted).length;

    return {
      clubs: clubStatuses,
      totalClubs,
      r1CompliancePct: totalClubs ? (r1Count / totalClubs) * 100 : 0,
      r2CompliancePct: totalClubs ? (r2Count / totalClubs) * 100 : 0,
    };
  }
}
