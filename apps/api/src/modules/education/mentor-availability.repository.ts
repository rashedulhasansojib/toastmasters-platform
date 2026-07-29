import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { MentorAvailability, MentorshipPurpose } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MentorAvailabilityRow = Awaited<ReturnType<PrismaClient['mentorAvailability']['upsert']>>;

function toMentorAvailability(row: MentorAvailabilityRow): MentorAvailability {
  return {
    id: row.id,
    personId: row.personId,
    orgUnitId: row.orgUnitId,
    isAvailable: row.isAvailable,
    maxConcurrentMentees: row.maxConcurrentMentees,
    strengths: row.strengths,
    preferredPurposes: row.preferredPurposes as MentorshipPurpose[],
  };
}

@Injectable()
export class MentorAvailabilityRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async upsert(input: {
    personId: string;
    orgUnitId: string;
    isAvailable: boolean;
    maxConcurrentMentees: number;
    strengths: string[];
    preferredPurposes: MentorshipPurpose[];
  }): Promise<MentorAvailability> {
    const row = await this.db.mentorAvailability.upsert({
      where: { personId_orgUnitId: { personId: input.personId, orgUnitId: input.orgUnitId } },
      create: input,
      update: input,
    });
    return toMentorAvailability(row);
  }

  async findByClub(orgUnitId: string): Promise<MentorAvailability[]> {
    const rows = await this.db.mentorAvailability.findMany({
      where: { orgUnitId, isAvailable: true },
    });
    return rows.map(toMentorAvailability);
  }
}
