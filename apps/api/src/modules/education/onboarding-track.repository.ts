import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { OnboardingTrack, OnboardingAudience, OnboardingStep } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type OnboardingTrackRow = Awaited<ReturnType<PrismaClient['onboardingTrack']['create']>>;

function toOnboardingTrack(row: OnboardingTrackRow): OnboardingTrack {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    name: row.name,
    audience: row.audience,
    forRoles: row.forRoles,
    isActive: row.isActive,
    steps: row.steps as unknown as OnboardingStep[],
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class OnboardingTrackRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    name: string;
    audience: OnboardingAudience;
    forRoles: string[];
    steps: OnboardingStep[];
  }): Promise<OnboardingTrack> {
    const row = await this.db.onboardingTrack.create({ data: { ...input, steps: input.steps } });
    return toOnboardingTrack(row);
  }

  async findById(id: string): Promise<OnboardingTrack | null> {
    const row = await this.db.onboardingTrack.findUnique({ where: { id } });
    return row ? toOnboardingTrack(row) : null;
  }

  async findByClub(orgUnitId: string): Promise<OnboardingTrack[]> {
    const rows = await this.db.onboardingTrack.findMany({
      where: { orgUnitId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toOnboardingTrack);
  }
}
