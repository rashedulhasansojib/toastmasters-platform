import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import type { DivisionDashboardResponse } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { OrgUnitRepository } from '../org/org.repository';
import { AreaVisitReportRepository } from './area-visit-report.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M8 Slice 4: system-design.md §22's Division Director interface — "Area
 * roll-up with aggregated visit compliance." Same shape as M6's
 * `AreaDashboardController`, one tier up: aggregates are per-area, never
 * per-club (FR-OVS-3 — one tier further removed from member/club detail
 * than the Area dashboard itself).
 */
@Controller('divisions/:divisionUnitId/dashboard')
export class DivisionDashboardController {
  constructor(
    private readonly orgUnits: OrgUnitRepository,
    private readonly visitReports: AreaVisitReportRepository,
  ) {}

  @Get()
  @ResourceScope('quality.area_visit_report', 'read', { source: 'param', key: 'divisionUnitId' })
  async get(
    @Param('divisionUnitId', uuidPipe) divisionUnitId: string,
    @Query('programYearId') programYearId: string,
  ): Promise<DivisionDashboardResponse> {
    const division = await this.orgUnits.findById(divisionUnitId);
    if (!division) throw new NotFoundException('Division not found');

    const subtree = await this.orgUnits.findSubtree(division.path);
    const areas = subtree.filter((u) => u.type === 'area');
    const clubs = subtree.filter((u) => u.type === 'club');

    const areaSummaries = await Promise.all(
      areas.map(async (area) => {
        const areaClubCount = clubs.filter((c) => c.path.startsWith(`${area.path}.`)).length;
        const counts = await this.visitReports.countSubmittedByArea(area.id, programYearId);
        return {
          areaUnitId: area.id,
          areaName: area.name,
          totalClubs: areaClubCount,
          r1CompliancePct: areaClubCount ? (counts.R1 / areaClubCount) * 100 : 0,
          r2CompliancePct: areaClubCount ? (counts.R2 / areaClubCount) * 100 : 0,
        };
      }),
    );

    return { areas: areaSummaries };
  }
}
