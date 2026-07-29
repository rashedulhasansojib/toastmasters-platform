import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { DcpProjection, DcpGoalTrace, DcpProjectedLevel } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type DcpProjectionRow = Awaited<ReturnType<PrismaClient['dcpProjection']['upsert']>>;

function toDcpProjection(row: DcpProjectionRow): DcpProjection {
  return {
    id: row.id,
    clubUnitId: row.clubUnitId,
    programYearId: row.programYearId,
    goals: row.goals as unknown as DcpGoalTrace[],
    membershipQualifierMet: row.membershipQualifierMet,
    clubSuccessPlanQualifierMet: row.clubSuccessPlanQualifierMet,
    projectedLevel: row.projectedLevel,
    computedAt: row.computedAt.toISOString(),
  };
}

/** M6 Slice 3: recomputed in place nightly by the worker — upsert on the (clubUnitId, programYearId) unique constraint, not an append-only log (it's a projection, not a fact). */
@Injectable()
export class DcpProjectionRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async upsert(input: {
    clubUnitId: string;
    programYearId: string;
    goals: DcpGoalTrace[];
    membershipQualifierMet: boolean;
    clubSuccessPlanQualifierMet: boolean;
    projectedLevel: DcpProjectedLevel;
  }): Promise<DcpProjection> {
    const row = await this.db.dcpProjection.upsert({
      where: {
        clubUnitId_programYearId: {
          clubUnitId: input.clubUnitId,
          programYearId: input.programYearId,
        },
      },
      create: { ...input, goals: input.goals, computedAt: new Date() },
      update: { ...input, goals: input.goals, computedAt: new Date() },
    });
    return toDcpProjection(row);
  }

  async findByClub(clubUnitId: string, programYearId: string): Promise<DcpProjection | null> {
    const row = await this.db.dcpProjection.findUnique({
      where: { clubUnitId_programYearId: { clubUnitId, programYearId } },
    });
    return row ? toDcpProjection(row) : null;
  }

  async findAllClubUnitIds(): Promise<string[]> {
    const rows = await this.db.orgUnit.findMany({ where: { type: 'club' }, select: { id: true } });
    return rows.map((r) => r.id);
  }
}
