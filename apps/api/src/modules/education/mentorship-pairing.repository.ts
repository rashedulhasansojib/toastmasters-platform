import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  MentorshipPairing,
  MentorshipPurpose,
  MentorshipEndedReason,
  MentorshipGoal,
  MentorshipCheckIn,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MentorshipPairingRow = Awaited<ReturnType<PrismaClient['mentorshipPairing']['create']>>;

function toMentorshipPairing(row: MentorshipPairingRow): MentorshipPairing {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    mentorPersonId: row.mentorPersonId,
    menteePersonId: row.menteePersonId,
    purpose: row.purpose,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endedReason: row.endedReason,
    assignedBy: row.assignedBy,
    goals: row.goals as unknown as MentorshipGoal[],
    checkIns: row.checkIns as unknown as MentorshipCheckIn[],
  };
}

@Injectable()
export class MentorshipPairingRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    mentorPersonId: string;
    menteePersonId: string;
    purpose: MentorshipPurpose;
    assignedBy: string;
  }): Promise<MentorshipPairing> {
    const row = await this.db.mentorshipPairing.create({ data: { ...input, status: 'active' } });
    return toMentorshipPairing(row);
  }

  async findActiveByMenteeAndPurpose(
    menteePersonId: string,
    purpose: MentorshipPurpose,
  ): Promise<MentorshipPairing | null> {
    const row = await this.db.mentorshipPairing.findFirst({
      where: { menteePersonId, purpose, status: { in: ['proposed', 'active'] } },
    });
    return row ? toMentorshipPairing(row) : null;
  }

  async countActiveByMentor(mentorPersonId: string): Promise<number> {
    return this.db.mentorshipPairing.count({
      where: { mentorPersonId, status: { in: ['proposed', 'active'] } },
    });
  }

  async findMismatchedWith(mentorPersonId: string, menteePersonId: string): Promise<number> {
    return this.db.mentorshipPairing.count({
      where: { mentorPersonId, menteePersonId, endedReason: 'mismatch' },
    });
  }

  async findByClub(orgUnitId: string): Promise<MentorshipPairing[]> {
    const rows = await this.db.mentorshipPairing.findMany({
      where: { orgUnitId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(toMentorshipPairing);
  }

  async findById(id: string): Promise<MentorshipPairing | null> {
    const row = await this.db.mentorshipPairing.findUnique({ where: { id } });
    return row ? toMentorshipPairing(row) : null;
  }

  async addCheckIn(id: string, checkIn: MentorshipCheckIn): Promise<MentorshipPairing> {
    const current = await this.db.mentorshipPairing.findUniqueOrThrow({ where: { id } });
    const checkIns = [...(current.checkIns as unknown as MentorshipCheckIn[]), checkIn];
    const row = await this.db.mentorshipPairing.update({
      where: { id },
      data: { checkIns: checkIns as never },
    });
    return toMentorshipPairing(row);
  }

  async end(id: string, reason: MentorshipEndedReason): Promise<MentorshipPairing> {
    const row = await this.db.mentorshipPairing.update({
      where: { id },
      data: { status: 'ended', endedAt: new Date(), endedReason: reason },
    });
    return toMentorshipPairing(row);
  }
}
