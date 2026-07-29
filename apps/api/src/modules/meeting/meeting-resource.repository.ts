import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { MeetingResource } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingResourceRow = Awaited<ReturnType<PrismaClient['meetingResource']['create']>>;

function toMeetingResource(row: MeetingResourceRow): MeetingResource {
  return {
    id: row.id,
    meetingId: row.meetingId,
    position: row.position,
    title: row.title,
    description: row.description,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** M9 Slice 4: free-form per-meeting notes and links. Position is server-assigned, like `AgendaItem`'s. */
@Injectable()
export class MeetingResourceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Position is `max(position) + 1` inside a transaction — a serialisable
   * read-then-write would otherwise let two concurrent adds collide on the
   * `(meeting_id, position)` unique index.
   */
  async create(input: {
    meetingId: string;
    title: string;
    description?: string;
    createdBy: string;
  }): Promise<MeetingResource> {
    const row = await this.db.$transaction(async (tx) => {
      const last = await tx.meetingResource.findFirst({
        where: { meetingId: input.meetingId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      return tx.meetingResource.create({
        data: {
          meetingId: input.meetingId,
          position: (last?.position ?? 0) + 1,
          title: input.title,
          description: input.description ?? null,
          createdBy: input.createdBy,
        },
      });
    });
    return toMeetingResource(row);
  }

  async update(input: {
    id: string;
    title?: string;
    description?: string | null;
  }): Promise<MeetingResource> {
    const row = await this.db.meetingResource.update({
      where: { id: input.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return toMeetingResource(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.meetingResource.delete({ where: { id } });
  }

  async findById(id: string): Promise<MeetingResource | null> {
    const row = await this.db.meetingResource.findUnique({ where: { id } });
    return row ? toMeetingResource(row) : null;
  }

  async findByMeeting(meetingId: string): Promise<MeetingResource[]> {
    const rows = await this.db.meetingResource.findMany({
      where: { meetingId },
      orderBy: { position: 'asc' },
    });
    return rows.map(toMeetingResource);
  }
}
