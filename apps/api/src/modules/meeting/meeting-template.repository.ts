import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, Prisma, type PrismaClient } from '@toastmasters/db';
import {
  meetingTemplateRole,
  tableTopicQuestion,
  wordOfDay,
  type Meeting,
  type MeetingTemplate,
  type MeetingTemplateRole,
  type TableTopicQuestion,
  type WordOfDay,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingTemplateRow = Awaited<ReturnType<PrismaClient['meetingTemplate']['create']>>;

function parseRoles(value: unknown): MeetingTemplateRole[] {
  const parsed = meetingTemplateRole.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseWordOfDay(value: unknown): WordOfDay | null {
  if (value == null) return null;
  const parsed = wordOfDay.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseTableTopics(value: unknown): TableTopicQuestion[] | null {
  if (value == null) return null;
  const parsed = tableTopicQuestion.array().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toMeetingTemplate(row: MeetingTemplateRow): MeetingTemplate {
  return {
    id: row.id,
    clubUnitId: row.clubUnitId,
    name: row.name,
    theme: row.theme,
    venue: row.venue,
    startTime: row.startTime,
    joinUrl: row.joinUrl,
    roles: parseRoles(row.roles),
    wordOfDay: parseWordOfDay(row.wordOfDay),
    tableTopicQuestions: parseTableTopics(row.tableTopicQuestions),
    isActive: row.isActive,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

type TemplateFields = {
  name?: string;
  theme?: string | null;
  venue?: string | null;
  startTime?: string | null;
  joinUrl?: string | null;
  roles?: MeetingTemplateRole[];
  wordOfDay?: WordOfDay | null;
  tableTopicQuestions?: TableTopicQuestion[] | null;
};

/**
 * M9 Slice 5: reusable meeting templates — the legacy portal's `isTemplate`
 * event, as its own aggregate.
 */
@Injectable()
export class MeetingTemplateRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(
    input: { clubUnitId: string; name: string; createdBy: string } & TemplateFields,
  ): Promise<MeetingTemplate> {
    const row = await this.db.meetingTemplate.create({
      data: {
        clubUnitId: input.clubUnitId,
        name: input.name,
        theme: input.theme ?? null,
        venue: input.venue ?? null,
        startTime: input.startTime ?? null,
        joinUrl: input.joinUrl ?? null,
        roles: input.roles ?? [],
        wordOfDay: input.wordOfDay ?? undefined,
        tableTopicQuestions: input.tableTopicQuestions ?? undefined,
        createdBy: input.createdBy,
      },
    });
    return toMeetingTemplate(row);
  }

  async update(id: string, patch: TemplateFields): Promise<MeetingTemplate> {
    const row = await this.db.meetingTemplate.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
        ...(patch.venue !== undefined ? { venue: patch.venue } : {}),
        ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
        ...(patch.joinUrl !== undefined ? { joinUrl: patch.joinUrl } : {}),
        ...(patch.roles !== undefined ? { roles: patch.roles } : {}),
        ...(patch.wordOfDay !== undefined
          ? { wordOfDay: patch.wordOfDay === null ? Prisma.JsonNull : patch.wordOfDay }
          : {}),
        ...(patch.tableTopicQuestions !== undefined
          ? {
              tableTopicQuestions:
                patch.tableTopicQuestions === null ? Prisma.JsonNull : patch.tableTopicQuestions,
            }
          : {}),
      },
    });
    return toMeetingTemplate(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.meetingTemplate.delete({ where: { id } });
  }

  async findById(id: string): Promise<MeetingTemplate | null> {
    const row = await this.db.meetingTemplate.findUnique({ where: { id } });
    return row ? toMeetingTemplate(row) : null;
  }

  async findByClub(clubUnitId: string): Promise<MeetingTemplate[]> {
    const rows = await this.db.meetingTemplate.findMany({
      where: { clubUnitId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(toMeetingTemplate);
  }

  /**
   * "Create & Build" from the legacy new-event dialog: one transaction that
   * creates the meeting and copies the template's role assignments onto
   * real rows.
   *
   * There are no agenda line items to copy: the running order is derived
   * from the roles and prepared speakers (`agenda-schedule.ts`).
   *
   * Roles are copied as `proposed` — the template records who *usually*
   * takes a role, not who has agreed to take it this week, and a person may
   * have left the club since the template was written, so anyone no longer
   * an active member is skipped rather than failing the whole create.
   */
  async createMeetingFrom(input: {
    template: MeetingTemplate;
    clubUnitId: string;
    programYearId: string;
    scheduledAt: Date;
    meetingNumber?: number;
    theme?: string;
    createdBy: string;
  }): Promise<Meeting> {
    const { template } = input;

    return this.db.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({
        data: {
          clubUnitId: input.clubUnitId,
          programYearId: input.programYearId,
          scheduledAt: input.scheduledAt,
          createdBy: input.createdBy,
          theme: input.theme ?? template.theme,
          venue: template.venue,
          joinUrl: template.joinUrl,
          meetingNumber: input.meetingNumber ?? null,
          wordOfDay: template.wordOfDay ?? undefined,
          tableTopicQuestions: template.tableTopicQuestions ?? undefined,
        },
      });

      if (template.roles.length > 0) {
        const stillMembers = await tx.clubMembership.findMany({
          where: {
            clubUnitId: input.clubUnitId,
            leftAt: null,
            personId: { in: template.roles.map((r) => r.personId) },
          },
          select: { personId: true },
        });
        const activeIds = new Set(stillMembers.map((m) => m.personId));
        const assignable = template.roles.filter((r) => activeIds.has(r.personId));

        if (assignable.length > 0) {
          await tx.meetingRoleAssignment.createMany({
            data: assignable.map((role) => ({
              meetingId: meeting.id,
              roleKey: role.roleKey,
              assigneeKind: 'member' as const,
              assigneePersonId: role.personId,
              status: 'proposed' as const,
            })),
          });
        }
      }

      return {
        id: meeting.id,
        clubUnitId: meeting.clubUnitId,
        programYearId: meeting.programYearId,
        scheduledAt: meeting.scheduledAt.toISOString(),
        status: meeting.status,
        title: meeting.title,
        theme: meeting.theme,
        venue: meeting.venue,
        meetingNumber: meeting.meetingNumber,
        wordOfDay: parseWordOfDay(meeting.wordOfDay),
        tableTopicQuestions: parseTableTopics(meeting.tableTopicQuestions),
        joinUrl: meeting.joinUrl,
        createdBy: meeting.createdBy,
        createdAt: meeting.createdAt.toISOString(),
      };
    });
  }

  /**
   * "Save this meeting as a template" — snapshots the meeting's current
   * metadata and *member* role assignments. Cross-club and unfilled
   * assignments are skipped: a template stores a club member the club can
   * re-assign next time, not a one-off visitor.
   *
   * Prepared speakers are deliberately not snapshotted — who speaks changes
   * every week, which is why the legacy portal emptied `speakers` on apply.
   */
  async snapshotFromMeeting(input: {
    clubUnitId: string;
    meetingId: string;
    name: string;
    createdBy: string;
  }): Promise<MeetingTemplate> {
    const [meeting, roleAssignments] = await Promise.all([
      this.db.meeting.findUnique({ where: { id: input.meetingId } }),
      this.db.meetingRoleAssignment.findMany({
        where: { meetingId: input.meetingId, assigneeKind: 'member' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (!meeting) throw new Error('Meeting not found');

    const startTime = meeting.scheduledAt.toISOString().slice(11, 16);

    return this.create({
      clubUnitId: input.clubUnitId,
      name: input.name,
      createdBy: input.createdBy,
      theme: meeting.theme,
      venue: meeting.venue,
      startTime,
      joinUrl: meeting.joinUrl,
      roles: roleAssignments
        .filter((a) => a.assigneePersonId !== null)
        .map((a) => ({ roleKey: a.roleKey, personId: a.assigneePersonId as string })),
      wordOfDay: parseWordOfDay(meeting.wordOfDay),
      tableTopicQuestions: parseTableTopics(meeting.tableTopicQuestions),
    });
  }
}
