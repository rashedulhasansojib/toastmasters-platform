import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { AgendaItem } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type AgendaItemRow = Awaited<ReturnType<PrismaClient['agendaItem']['create']>>;

function toAgendaItem(row: AgendaItemRow): AgendaItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    position: row.position,
    title: row.title,
    plannedDurationSeconds: row.plannedDurationSeconds,
    roleKey: row.roleKey,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AgendaItemRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** Position is server-assigned — append-only, never client-supplied (M3 Slice 1). */
  async create(input: {
    meetingId: string;
    title: string;
    plannedDurationSeconds: number;
    roleKey?: string;
  }): Promise<AgendaItem> {
    const row = await this.db.$transaction(async (tx) => {
      const last = await tx.agendaItem.findFirst({
        where: { meetingId: input.meetingId },
        orderBy: { position: 'desc' },
      });
      return tx.agendaItem.create({
        data: {
          meetingId: input.meetingId,
          position: (last?.position ?? 0) + 1,
          title: input.title,
          plannedDurationSeconds: input.plannedDurationSeconds,
          roleKey: input.roleKey ?? null,
        },
      });
    });
    return toAgendaItem(row);
  }

  async findByMeeting(meetingId: string): Promise<AgendaItem[]> {
    const rows = await this.db.agendaItem.findMany({
      where: { meetingId },
      orderBy: { position: 'asc' },
    });
    return rows.map(toAgendaItem);
  }
}
