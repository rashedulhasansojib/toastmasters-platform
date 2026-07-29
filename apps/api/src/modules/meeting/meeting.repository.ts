import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, Prisma, type PrismaClient } from '@toastmasters/db';
import {
  tableTopicQuestion,
  wordOfDay,
  type Meeting,
  type TableTopicQuestion,
  type WordOfDay,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingRow = Awaited<ReturnType<PrismaClient['meeting']['create']>>;

function parseWordOfDay(value: unknown): WordOfDay | null {
  if (value == null) return null;
  const parsed = wordOfDay.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseTableTopicQuestions(value: unknown): TableTopicQuestion[] | null {
  if (value == null) return null;
  const parsed = tableTopicQuestion.array().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    clubUnitId: row.clubUnitId,
    programYearId: row.programYearId,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    title: row.title,
    theme: row.theme,
    venue: row.venue,
    meetingNumber: row.meetingNumber,
    wordOfDay: parseWordOfDay(row.wordOfDay),
    tableTopicQuestions: parseTableTopicQuestions(row.tableTopicQuestions),
    joinUrl: row.joinUrl,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Fields optionally present in a create/update request; each maps 1:1 to a column. */
type MutableMeetingFields = {
  title?: string | null;
  theme?: string | null;
  venue?: string | null;
  meetingNumber?: number | null;
  wordOfDay?: WordOfDay | null;
  tableTopicQuestions?: TableTopicQuestion[] | null;
  joinUrl?: string | null;
};

@Injectable()
export class MeetingRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(
    input: {
      clubUnitId: string;
      programYearId: string;
      scheduledAt: Date;
      createdBy: string;
    } & MutableMeetingFields,
  ): Promise<Meeting> {
    const row = await this.db.meeting.create({
      data: {
        clubUnitId: input.clubUnitId,
        programYearId: input.programYearId,
        scheduledAt: input.scheduledAt,
        createdBy: input.createdBy,
        title: input.title ?? null,
        theme: input.theme ?? null,
        venue: input.venue ?? null,
        meetingNumber: input.meetingNumber ?? null,
        wordOfDay: input.wordOfDay ?? undefined,
        tableTopicQuestions: input.tableTopicQuestions ?? undefined,
        joinUrl: input.joinUrl ?? null,
      },
    });
    return toMeeting(row);
  }

  /** Partial update of descriptive metadata + scheduledAt. Never touches status — the lifecycle repository owns transitions. */
  async update(id: string, patch: MutableMeetingFields & { scheduledAt?: Date }): Promise<Meeting> {
    const row = await this.db.meeting.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
        ...(patch.venue !== undefined ? { venue: patch.venue } : {}),
        ...(patch.meetingNumber !== undefined ? { meetingNumber: patch.meetingNumber } : {}),
        ...(patch.wordOfDay !== undefined
          ? { wordOfDay: patch.wordOfDay === null ? Prisma.JsonNull : patch.wordOfDay }
          : {}),
        ...(patch.tableTopicQuestions !== undefined
          ? {
              tableTopicQuestions:
                patch.tableTopicQuestions === null ? Prisma.JsonNull : patch.tableTopicQuestions,
            }
          : {}),
        ...(patch.joinUrl !== undefined ? { joinUrl: patch.joinUrl } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
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

  /** M4 Slice 10: the public page's feed — published and still in the future only, never draft/in_progress/closed/cancelled internals. */
  async findUpcomingPublished(clubUnitId: string): Promise<Meeting[]> {
    const rows = await this.db.meeting.findMany({
      where: { clubUnitId, status: 'published', scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(toMeeting);
  }
}
