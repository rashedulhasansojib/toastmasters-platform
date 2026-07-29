import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  ClubSuccessPlan,
  ClubSuccessPlanGoalTarget,
  ClubSuccessPlanContributor,
  ClubSuccessPlanReview,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ClubSuccessPlanRow = Awaited<ReturnType<PrismaClient['clubSuccessPlan']['create']>>;

function toClubSuccessPlan(row: ClubSuccessPlanRow): ClubSuccessPlan {
  return {
    id: row.id,
    clubUnitId: row.clubUnitId,
    programYearId: row.programYearId,
    goalTargets: row.goalTargets as unknown as ClubSuccessPlanGoalTarget[],
    membershipTarget: row.membershipTarget,
    strengths: row.strengths,
    challenges: row.challenges,
    contributors: row.contributors as unknown as ClubSuccessPlanContributor[],
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    submittedBy: row.submittedBy,
    tiSubmissionConfirmedAt: row.tiSubmissionConfirmedAt?.toISOString() ?? null,
    reviews: row.reviews as unknown as ClubSuccessPlanReview[],
  };
}

@Injectable()
export class ClubSuccessPlanRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    clubUnitId: string;
    programYearId: string;
    goalTargets: ClubSuccessPlanGoalTarget[];
    membershipTarget: number;
    strengths?: string;
    challenges?: string;
  }): Promise<ClubSuccessPlan> {
    const row = await this.db.clubSuccessPlan.create({ data: input });
    return toClubSuccessPlan(row);
  }

  async findByClubAndYear(
    clubUnitId: string,
    programYearId: string,
  ): Promise<ClubSuccessPlan | null> {
    const row = await this.db.clubSuccessPlan.findUnique({
      where: { clubUnitId_programYearId: { clubUnitId, programYearId } },
    });
    return row ? toClubSuccessPlan(row) : null;
  }

  async update(
    id: string,
    input: Partial<{
      goalTargets: ClubSuccessPlanGoalTarget[];
      membershipTarget: number;
      strengths: string;
      challenges: string;
    }>,
  ): Promise<ClubSuccessPlan> {
    const row = await this.db.clubSuccessPlan.update({ where: { id }, data: input });
    return toClubSuccessPlan(row);
  }

  async submit(id: string, submittedBy: string): Promise<ClubSuccessPlan> {
    const row = await this.db.clubSuccessPlan.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date(), submittedBy },
    });
    return toClubSuccessPlan(row);
  }

  async addReview(id: string, review: ClubSuccessPlanReview): Promise<ClubSuccessPlan> {
    const current = await this.db.clubSuccessPlan.findUniqueOrThrow({ where: { id } });
    const reviews = [...(current.reviews as unknown as ClubSuccessPlanReview[]), review];
    const row = await this.db.clubSuccessPlan.update({
      where: { id },
      data: { reviews: reviews as never, status: 'revised' },
    });
    return toClubSuccessPlan(row);
  }
}
