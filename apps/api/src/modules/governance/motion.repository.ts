import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Motion, MotionOutcome, MotionVote } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MotionRow = Awaited<ReturnType<PrismaClient['motion']['create']>>;

function toMotion(row: MotionRow): Motion {
  return {
    id: row.id,
    excomMeetingId: row.excomMeetingId,
    seq: row.seq,
    text: row.text,
    movedByPersonId: row.movedByPersonId,
    secondedByPersonId: row.secondedByPersonId,
    discussion: row.discussion,
    vote: row.vote as unknown as MotionVote | null,
    outcome: row.outcome,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : null,
    supersedesMotionId: row.supersedesMotionId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MotionRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    excomMeetingId: string;
    text: string;
    movedByPersonId: string;
    secondedByPersonId?: string;
    discussion?: string;
  }): Promise<Motion> {
    const count = await this.db.motion.count({ where: { excomMeetingId: input.excomMeetingId } });
    const row = await this.db.motion.create({
      data: {
        ...input,
        seq: count + 1,
        outcome: input.secondedByPersonId ? 'tabled' : 'no_second',
      },
    });
    return toMotion(row);
  }

  async findById(id: string): Promise<Motion | null> {
    const row = await this.db.motion.findUnique({ where: { id } });
    return row ? toMotion(row) : null;
  }

  async findByMeeting(excomMeetingId: string): Promise<Motion[]> {
    const rows = await this.db.motion.findMany({
      where: { excomMeetingId },
      orderBy: { seq: 'asc' },
    });
    return rows.map(toMotion);
  }

  async recordVote(
    id: string,
    vote: MotionVote,
    outcome: MotionOutcome,
    effectiveFrom?: Date,
  ): Promise<Motion> {
    const row = await this.db.motion.update({
      where: { id },
      data: { vote: vote as never, outcome, effectiveFrom },
    });
    return toMotion(row);
  }

  async withdraw(id: string): Promise<Motion> {
    const row = await this.db.motion.update({ where: { id }, data: { outcome: 'withdrawn' } });
    return toMotion(row);
  }
}
