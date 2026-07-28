import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Meeting } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingRow = Awaited<ReturnType<PrismaClient['meeting']['create']>>;

function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    clubUnitId: row.clubUnitId,
    programYearId: row.programYearId,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MeetingRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    clubUnitId: string;
    programYearId: string;
    scheduledAt: Date;
    createdBy: string;
  }): Promise<Meeting> {
    const row = await this.db.meeting.create({
      data: {
        clubUnitId: input.clubUnitId,
        programYearId: input.programYearId,
        scheduledAt: input.scheduledAt,
        createdBy: input.createdBy,
      },
    });
    return toMeeting(row);
  }

  async findById(id: string): Promise<Meeting | null> {
    const row = await this.db.meeting.findUnique({ where: { id } });
    return row ? toMeeting(row) : null;
  }

  /** Scoped read — the WHERE clause, not app-code filtering (rbac-design.md §4.3, FR-AUTHZ-8). */
  async findByClub(clubUnitId: string): Promise<Meeting[]> {
    const rows = await this.db.meeting.findMany({
      where: { clubUnitId },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(toMeeting);
  }
}
