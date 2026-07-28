import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  generateFinancialReportRequestSchema,
  type GenerateFinancialReportRequest,
  type FinancialReport,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { FinancialReportService } from './financial-report.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 9: system-design.md §12.4. `finance.report` is `restricted`, same bracket as the rest of the finance domain. */
@Controller('clubs/:clubUnitId/financial-reports')
export class FinancialReportController {
  constructor(private readonly reports: FinancialReportService) {}

  @Post()
  @ResourceScope('finance.report', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(generateFinancialReportRequestSchema))
    body: GenerateFinancialReportRequest,
  ): Promise<FinancialReport> {
    return this.reports.generate(clubUnitId, { ...body, generatedBy: principal.userId });
  }

  @Get()
  @ResourceScope('finance.report', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<FinancialReport[]> {
    return this.reports.list(clubUnitId);
  }

  @Get(':reportId')
  @ResourceScope('finance.report', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('reportId', uuidPipe) reportId: string,
  ): Promise<FinancialReport> {
    const report = await this.reports.findById(reportId);
    if (!report || report.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Financial report not found');
    }
    return report;
  }

  /** Freezes the report — `status: 'final'`, figures never change again (I-19). Granted to both Treasurer and President, not Treasurer alone, unlike installment-plan approval. */
  @Post(':reportId/finalize')
  @ResourceScope('finance.report', 'update', { source: 'param', key: 'clubUnitId' })
  finalize(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('reportId', uuidPipe) reportId: string,
    @CurrentUser() principal: Principal,
  ): Promise<FinancialReport> {
    return this.reports.finalize(clubUnitId, reportId, principal.userId);
  }
}
