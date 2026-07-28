import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ProspectVisit } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ProspectVisitRow = Awaited<ReturnType<PrismaClient['prospectVisit']['create']>>;

function toProspectVisit(row: ProspectVisitRow): ProspectVisit {
  return {
    id: row.id,
    prospectId: row.prospectId,
    meetingId: row.meetingId,
    attendedAt: row.attendedAt.toISOString(),
    loggedBy: row.loggedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ProspectVisitRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** One visit per (prospect, meeting) via the DB's own unique constraint — same pattern as ballot.repository.ts's vote uniqueness. */
  async create(input: {
    prospectId: string;
    meetingId: string;
    attendedAt: Date;
    loggedBy: string;
  }): Promise<ProspectVisit> {
    try {
      const row = await this.db.prospectVisit.create({ data: input });
      return toProspectVisit(row);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Visit already logged for this meeting');
      }
      throw err;
    }
  }

  async findByProspect(prospectId: string): Promise<ProspectVisit[]> {
    const rows = await this.db.prospectVisit.findMany({
      where: { prospectId },
      orderBy: { attendedAt: 'desc' },
    });
    return rows.map(toProspectVisit);
  }
}
