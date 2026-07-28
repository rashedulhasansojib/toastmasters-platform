import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  FinancialReport,
  FinancialReportCategoryAmount,
  FinancialReportDuesSummary,
  FinancialReportMemberCounts,
  FinancialReportType,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type FinancialReportRow = Awaited<ReturnType<PrismaClient['financialReport']['create']>>;

function toFinancialReport(row: FinancialReportRow): FinancialReport {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    type: row.type,
    periodFrom: row.periodFrom.toISOString().slice(0, 10),
    periodTo: row.periodTo.toISOString().slice(0, 10),
    openingBalance: row.openingBalance.toNumber(),
    closingBalance: row.closingBalance.toNumber(),
    currency: row.currency,
    income: row.income as FinancialReportCategoryAmount[],
    expenses: row.expenses as FinancialReportCategoryAmount[],
    duesSummary: row.duesSummary as FinancialReportDuesSummary,
    memberCounts: row.memberCounts as FinancialReportMemberCounts,
    narrative: row.narrative,
    status: row.status,
    generatedBy: row.generatedBy,
    generatedAt: row.generatedAt.toISOString(),
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    snapshotUrl: row.snapshotUrl,
  };
}

@Injectable()
export class FinancialReportRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    type: FinancialReportType;
    periodFrom: Date;
    periodTo: Date;
    openingBalance: number;
    closingBalance: number;
    currency: string;
    income: FinancialReportCategoryAmount[];
    expenses: FinancialReportCategoryAmount[];
    duesSummary: FinancialReportDuesSummary;
    memberCounts: FinancialReportMemberCounts;
    narrative?: string;
    generatedBy: string;
  }): Promise<FinancialReport> {
    const row = await this.db.financialReport.create({ data: input });
    return toFinancialReport(row);
  }

  async findByClub(orgUnitId: string): Promise<FinancialReport[]> {
    const rows = await this.db.financialReport.findMany({
      where: { orgUnitId },
      orderBy: { generatedAt: 'desc' },
    });
    return rows.map(toFinancialReport);
  }

  async findById(id: string): Promise<FinancialReport | null> {
    const row = await this.db.financialReport.findUnique({ where: { id } });
    return row ? toFinancialReport(row) : null;
  }

  async finalize(id: string, approvedBy: string): Promise<FinancialReport> {
    const row = await this.db.financialReport.update({
      where: { id },
      data: { status: 'final', approvedBy, approvedAt: new Date() },
    });
    return toFinancialReport(row);
  }
}
