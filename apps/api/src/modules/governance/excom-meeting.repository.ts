import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  ExComMeeting,
  ExComMeetingStatus,
  ExComAttendee,
  ExComAgendaItem,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ExComMeetingRow = Awaited<ReturnType<PrismaClient['exComMeeting']['create']>>;

function toExComMeeting(row: ExComMeetingRow): ExComMeeting {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    heldAt: row.heldAt.toISOString(),
    location: row.location,
    calledBy: row.calledBy,
    attendees: row.attendees as unknown as ExComAttendee[],
    quorumRule: row.quorumRule,
    quorumMet: row.quorumMet,
    agenda: row.agenda as unknown as ExComAgendaItem[],
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ExComMeetingRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    heldAt: Date;
    location: string;
    calledBy: string;
    quorumRule: string;
    agenda: ExComAgendaItem[];
  }): Promise<ExComMeeting> {
    const row = await this.db.exComMeeting.create({ data: { ...input, attendees: [] } });
    return toExComMeeting(row);
  }

  async findById(id: string): Promise<ExComMeeting | null> {
    const row = await this.db.exComMeeting.findUnique({ where: { id } });
    return row ? toExComMeeting(row) : null;
  }

  async findByClub(orgUnitId: string): Promise<ExComMeeting[]> {
    const rows = await this.db.exComMeeting.findMany({
      where: { orgUnitId },
      orderBy: { heldAt: 'desc' },
    });
    return rows.map(toExComMeeting);
  }

  async update(
    id: string,
    input: Partial<{ attendees: ExComAttendee[]; agenda: ExComAgendaItem[]; quorumMet: boolean }>,
  ): Promise<ExComMeeting> {
    const row = await this.db.exComMeeting.update({ where: { id }, data: input as never });
    return toExComMeeting(row);
  }

  async setStatus(id: string, status: ExComMeetingStatus): Promise<ExComMeeting> {
    const row = await this.db.exComMeeting.update({ where: { id }, data: { status } });
    return toExComMeeting(row);
  }
}
