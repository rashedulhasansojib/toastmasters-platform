import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { OnboardingProgress, OnboardingProgressStep } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { OnboardingTrackRepository } from './onboarding-track.repository';

type OnboardingProgressRow = Awaited<ReturnType<PrismaClient['onboardingProgress']['create']>>;

function toOnboardingProgress(row: OnboardingProgressRow): OnboardingProgress {
  return {
    id: row.id,
    personId: row.personId,
    trackId: row.trackId,
    orgUnitId: row.orgUnitId,
    enrolledAt: row.enrolledAt.toISOString(),
    steps: row.steps as unknown as OnboardingProgressStep[],
    completedAt: row.completedAt?.toISOString() ?? null,
    nudgedAt: row.nudgedAt?.toISOString() ?? null,
  };
}

/** Explicit officer-initiated enrolment — see the M7 plan doc's scope-cut note on automatic triggers. */
@Injectable()
export class OnboardingProgressRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly tracks: OnboardingTrackRepository,
  ) {}

  /** `steps` snapshots the track's steps at enrolment time — a later track edit never rewrites an in-progress checklist (same pattern as `ChecklistRun`). */
  async enroll(input: {
    personId: string;
    trackId: string;
    orgUnitId: string;
  }): Promise<OnboardingProgress> {
    const track = await this.tracks.findById(input.trackId);
    if (!track) throw new BadRequestException('Onboarding track not found');
    const steps: OnboardingProgressStep[] = track.steps.map((s) => ({
      key: s.key,
      completedAt: null,
      note: null,
    }));
    const row = await this.db.onboardingProgress.create({
      data: { personId: input.personId, trackId: input.trackId, orgUnitId: input.orgUnitId, steps },
    });
    return toOnboardingProgress(row);
  }

  async findById(id: string): Promise<OnboardingProgress | null> {
    const row = await this.db.onboardingProgress.findUnique({ where: { id } });
    return row ? toOnboardingProgress(row) : null;
  }

  async findByClub(orgUnitId: string, personId?: string): Promise<OnboardingProgress[]> {
    const rows = await this.db.onboardingProgress.findMany({
      where: { orgUnitId, ...(personId ? { personId } : {}) },
      orderBy: { enrolledAt: 'desc' },
    });
    return rows.map(toOnboardingProgress);
  }

  async completeStep(id: string, key: string, note?: string): Promise<OnboardingProgress> {
    const current = await this.db.onboardingProgress.findUniqueOrThrow({ where: { id } });
    const steps = (current.steps as unknown as OnboardingProgressStep[]).map((s) =>
      s.key === key ? { ...s, completedAt: new Date().toISOString(), note: note ?? s.note } : s,
    );
    const completedAt = steps.every((s) => s.completedAt) ? new Date() : null;
    const row = await this.db.onboardingProgress.update({
      where: { id },
      data: { steps, completedAt },
    });
    return toOnboardingProgress(row);
  }
}
