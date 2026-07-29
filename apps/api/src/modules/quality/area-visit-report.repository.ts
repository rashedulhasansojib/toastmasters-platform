import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  AreaVisitReport,
  AreaVisitRound,
  AreaVisitMode,
  MomentOfTruthRating,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type AreaVisitReportRow = Awaited<ReturnType<PrismaClient['areaVisitReport']['create']>>;

function toAreaVisitReport(row: AreaVisitReportRow): AreaVisitReport {
  return {
    id: row.id,
    areaUnitId: row.areaUnitId,
    clubUnitId: row.clubUnitId,
    programYearId: row.programYearId,
    round: row.round,
    visitedAt: row.visitedAt.toISOString().slice(0, 10),
    visitMode: row.visitMode,
    byPersonId: row.byPersonId,
    momentsOfTruth: row.momentsOfTruth as unknown as MomentOfTruthRating[],
    clubGoalsDiscussed: row.clubGoalsDiscussed,
    supportRequestedFromDistrict: row.supportRequestedFromDistrict,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AreaVisitReportRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    areaUnitId: string;
    clubUnitId: string;
    programYearId: string;
    round: AreaVisitRound;
    visitedAt: Date;
    visitMode: AreaVisitMode;
    byPersonId: string;
    momentsOfTruth: MomentOfTruthRating[];
    clubGoalsDiscussed?: string;
    supportRequestedFromDistrict?: string;
  }): Promise<AreaVisitReport> {
    const row = await this.db.areaVisitReport.create({
      data: { ...input, momentsOfTruth: input.momentsOfTruth },
    });
    return toAreaVisitReport(row);
  }

  async findByClub(clubUnitId: string): Promise<AreaVisitReport[]> {
    const rows = await this.db.areaVisitReport.findMany({
      where: { clubUnitId },
      orderBy: { visitedAt: 'desc' },
    });
    return rows.map(toAreaVisitReport);
  }

  async findById(id: string): Promise<AreaVisitReport | null> {
    const row = await this.db.areaVisitReport.findUnique({ where: { id } });
    return row ? toAreaVisitReport(row) : null;
  }

  async submit(id: string): Promise<AreaVisitReport> {
    const row = await this.db.areaVisitReport.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date() },
    });
    return toAreaVisitReport(row);
  }

  /** Visit-compliance count for the Area dashboard (FR-OVS-6) — submitted reports per round, area-wide. */
  async countSubmittedByArea(
    areaUnitId: string,
    programYearId: string,
  ): Promise<Record<AreaVisitRound, number>> {
    const rows = await this.db.areaVisitReport.groupBy({
      by: ['round'],
      where: { areaUnitId, programYearId, status: 'submitted' },
      _count: { _all: true },
    });
    const result: Record<AreaVisitRound, number> = { R1: 0, R2: 0 };
    for (const row of rows) result[row.round] = row._count._all;
    return result;
  }
}
