import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { GuestVisit } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type GuestVisitRow = Awaited<ReturnType<PrismaClient['guestVisit']['create']>>;

function toGuestVisit(row: GuestVisitRow): GuestVisit {
  return {
    id: row.id,
    guestId: row.guestId,
    meetingId: row.meetingId,
    attendedAt: row.attendedAt.toISOString(),
    loggedBy: row.loggedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class GuestVisitRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** One visit per (guest, meeting) via the DB's own unique constraint — same pattern as ballot.repository.ts's vote uniqueness. */
  async create(input: {
    guestId: string;
    meetingId: string;
    attendedAt: Date;
    loggedBy: string;
  }): Promise<GuestVisit> {
    try {
      const row = await this.db.guestVisit.create({ data: input });
      return toGuestVisit(row);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Visit already logged for this meeting');
      }
      throw err;
    }
  }

  async findByGuest(guestId: string): Promise<GuestVisit[]> {
    const rows = await this.db.guestVisit.findMany({
      where: { guestId },
      orderBy: { attendedAt: 'desc' },
    });
    return rows.map(toGuestVisit);
  }
}
