import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { MeetingRoleKey, PlannerRow } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

/** A club member as far as name resolution is concerned. */
export interface PlannerCandidate {
  personId: string;
  fullName: string;
}

/**
 * FR-MTG-5: the planner reads through to `Meeting` + `MeetingRoleAssignment`.
 * There is no planner table, so there is nothing here that can fall out of
 * step with the meeting pages.
 */
@Injectable()
export class PlannerRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** One query, `include`d rather than N+1 per meeting (CLAUDE.md §6). */
  async grid(clubUnitId: string, from: Date, to: Date): Promise<PlannerRow[]> {
    const meetings = await this.db.meeting.findMany({
      where: { clubUnitId, scheduledAt: { gte: from, lte: to } },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        scheduledAt: true,
        title: true,
        theme: true,
        status: true,
        roleAssignments: {
          select: {
            id: true,
            roleKey: true,
            slotIndex: true,
            assigneeKind: true,
            assigneePersonId: true,
            assigneeGuestId: true,
            status: true,
            assigneePerson: { select: { fullName: true } },
            assigneeGuest: { select: { fullName: true, piiRedactedAt: true } },
          },
          orderBy: [{ roleKey: 'asc' }, { slotIndex: 'asc' }],
        },
      },
    });

    return meetings.map((meeting) => ({
      meetingId: meeting.id,
      scheduledAt: meeting.scheduledAt.toISOString(),
      title: meeting.title,
      theme: meeting.theme,
      status: meeting.status,
      cells: meeting.roleAssignments.map((a) => ({
        roleKey: a.roleKey,
        slotIndex: a.slotIndex,
        assignmentId: a.id,
        kind: a.assigneeKind,
        personId: a.assigneePersonId,
        guestId: a.assigneeGuestId,
        // If the guest has been anonymised by the retention job (§ CLAUDE.md
        // §2 decision 4), surface a neutral placeholder rather than the
        // now-empty fullName.
        fullName:
          a.assigneePerson?.fullName ??
          (a.assigneeGuest
            ? a.assigneeGuest.piiRedactedAt
              ? '(guest, redacted)'
              : a.assigneeGuest.fullName
            : null),
        status: a.status,
      })),
    }));
  }

  /**
   * Active members of the club, for resolving spreadsheet names. Only active
   * memberships — importing a name that left the club last year should land in
   * the pending list, not silently assign a former member.
   */
  async candidates(clubUnitId: string): Promise<PlannerCandidate[]> {
    const memberships = await this.db.clubMembership.findMany({
      where: { clubUnitId, localStatus: 'active' },
      select: { personId: true, person: { select: { fullName: true } } },
    });
    return memberships.map((m) => ({ personId: m.personId, fullName: m.person.fullName }));
  }

  /** Meetings already scheduled on any of these instants, so import matches rather than duplicates. */
  async findByScheduledAt(
    clubUnitId: string,
    instants: Date[],
  ): Promise<Map<number, { id: string }>> {
    if (instants.length === 0) return new Map();
    const rows = await this.db.meeting.findMany({
      where: { clubUnitId, scheduledAt: { in: instants } },
      select: { id: true, scheduledAt: true },
    });
    return new Map(rows.map((r) => [r.scheduledAt.getTime(), { id: r.id }]));
  }

  async createMeeting(input: {
    clubUnitId: string;
    programYearId: string;
    scheduledAt: Date;
    theme?: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const row = await this.db.meeting.create({
      data: {
        clubUnitId: input.clubUnitId,
        programYearId: input.programYearId,
        scheduledAt: input.scheduledAt,
        theme: input.theme ?? null,
        createdBy: input.createdBy,
      },
      select: { id: true },
    });
    return row;
  }

  async setMeetingTheme(meetingId: string, theme: string): Promise<void> {
    await this.db.meeting.update({ where: { id: meetingId }, data: { theme } });
  }

  /** Which (role, slot) pairs are already taken, so import never double-books a slot. */
  async existingSlots(
    meetingIds: string[],
  ): Promise<Set<`${string}:${MeetingRoleKey}:${number | 'null'}`>> {
    if (meetingIds.length === 0) return new Set();
    const rows = await this.db.meetingRoleAssignment.findMany({
      where: { meetingId: { in: meetingIds } },
      select: { meetingId: true, roleKey: true, slotIndex: true },
    });
    return new Set(
      rows.map((r) => `${r.meetingId}:${r.roleKey}:${r.slotIndex ?? 'null'}` as const),
    );
  }

  /** Imported rows land as `proposed`, never `confirmed` — a spreadsheet is a plan, not a person's agreement. */
  async createAssignments(
    rows: Array<{
      meetingId: string;
      roleKey: MeetingRoleKey;
      slotIndex: number | null;
      personId: string;
    }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await this.db.meetingRoleAssignment.createMany({
      data: rows.map((r) => ({
        meetingId: r.meetingId,
        roleKey: r.roleKey,
        slotIndex: r.slotIndex,
        assigneeKind: 'member' as const,
        assigneePersonId: r.personId,
        status: 'proposed' as const,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }
}
