import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createAreaVisitReportRequestSchema,
  type CreateAreaVisitReportRequest,
  type AreaVisitReport,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { AreaVisitReportRepository } from './area-visit-report.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M6 Slice 1: system-design.md §16.2. Club-scoped — the filing Area Director's grant, anchored at their area, authorizes via org-tree prefix inheritance (see the M6 plan doc). */
@Controller('clubs/:clubUnitId/visit-reports')
export class AreaVisitReportController {
  constructor(private readonly reports: AreaVisitReportRepository) {}

  @Post()
  @ResourceScope('quality.area_visit_report', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createAreaVisitReportRequestSchema))
    body: CreateAreaVisitReportRequest,
  ): Promise<AreaVisitReport> {
    return this.reports.create({
      areaUnitId: body.areaUnitId,
      clubUnitId,
      programYearId: body.programYearId,
      round: body.round,
      visitedAt: new Date(body.visitedAt),
      visitMode: body.visitMode,
      byPersonId: principal.userId,
      momentsOfTruth: body.momentsOfTruth,
      clubGoalsDiscussed: body.clubGoalsDiscussed,
      supportRequestedFromDistrict: body.supportRequestedFromDistrict,
    });
  }

  @Get()
  @ResourceScope('quality.area_visit_report', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<AreaVisitReport[]> {
    return this.reports.findByClub(clubUnitId);
  }

  @Post(':id/submit')
  @ResourceScope('quality.area_visit_report', 'update', { source: 'param', key: 'clubUnitId' })
  submit(@Param('id', uuidPipe) id: string): Promise<AreaVisitReport> {
    return this.reports.submit(id);
  }
}
