import { createHmac } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Ballot, BallotCandidate, BallotTallyResult } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type BallotRow = Awaited<ReturnType<PrismaClient['ballot']['create']>>;

function toBallot(row: BallotRow): Ballot {
  return {
    id: row.id,
    meetingId: row.meetingId,
    category: row.category,
    status: row.status,
    eligibility: row.eligibility,
    candidates: row.candidates as unknown as BallotCandidate[],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    tallyResult: (row.tallyResult as unknown as BallotTallyResult | null) ?? null,
    talliedAt: row.talliedAt?.toISOString() ?? null,
  };
}

/** system-design.md §9.4 — HMAC(key: ballotId, message: personId), not a secret shared beyond this row's own uniqueness check. */
function voterHash(ballotId: string, personId: string): string {
  return createHmac('sha256', ballotId).update(personId).digest('hex');
}

@Injectable()
export class BallotRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** One ballot per (meeting, category) — created already `open` (M3 Slice 10 scoping). */
  async create(input: {
    meetingId: string;
    category: Ballot['category'];
    eligibility: Ballot['eligibility'];
    candidates: BallotCandidate[];
    createdBy: string;
  }): Promise<Ballot> {
    const row = await this.db.ballot.create({
      data: {
        meetingId: input.meetingId,
        category: input.category,
        eligibility: input.eligibility,
        candidates: input.candidates as never,
        createdBy: input.createdBy,
      },
    });
    return toBallot(row);
  }

  async findByMeeting(meetingId: string): Promise<Ballot[]> {
    const rows = await this.db.ballot.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toBallot);
  }

  async findById(id: string): Promise<Ballot | null> {
    const row = await this.db.ballot.findUnique({ where: { id } });
    return row ? toBallot(row) : null;
  }

  /** One vote per (ballot, voter) via the DB's own unique constraint — not an in-transaction check (CLAUDE.md's own convention). */
  async castVote(input: { ballotId: string; voterPersonId: string; candidatePersonId: string }) {
    try {
      await this.db.vote.create({
        data: {
          ballotId: input.ballotId,
          voterHash: voterHash(input.ballotId, input.voterPersonId),
          candidatePersonId: input.candidatePersonId,
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Already voted on this ballot');
      }
      throw err;
    }
  }

  /** Tallies once and freezes the result — never re-tallies (append-only-adjacent: a tallied ballot's result is a fact, not recomputed live). */
  async tally(input: { ballotId: string; talliedBy: string }): Promise<Ballot> {
    const existing = await this.db.ballot.findUniqueOrThrow({ where: { id: input.ballotId } });
    if (existing.status === 'tallied') {
      throw new BadRequestException('Ballot already tallied');
    }

    const votes = await this.db.vote.findMany({ where: { ballotId: input.ballotId } });
    const counts = new Map<string, number>();
    for (const vote of votes) {
      counts.set(vote.candidatePersonId, (counts.get(vote.candidatePersonId) ?? 0) + 1);
    }
    const tally = [...counts.entries()].map(([personId, count]) => ({ personId, count }));
    const maxCount = tally.reduce((max, t) => Math.max(max, t.count), 0);
    const leaders = tally.filter((t) => t.count === maxCount).map((t) => t.personId);
    const result: BallotTallyResult = {
      winnerPersonId: maxCount > 0 && leaders.length === 1 ? (leaders[0] ?? null) : null,
      tally,
      tiedWith: maxCount > 0 && leaders.length > 1 ? leaders : [],
    };

    const row = await this.db.ballot.update({
      where: { id: input.ballotId },
      data: {
        status: 'tallied',
        tallyResult: result as never,
        talliedBy: input.talliedBy,
        talliedAt: new Date(),
      },
    });
    return toBallot(row);
  }
}
