import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { MeetingRoleAssignment, MeetingRoleAssignee } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingRoleAssignmentRow = Awaited<
  ReturnType<PrismaClient['meetingRoleAssignment']['create']>
>;

function toAssignee(row: MeetingRoleAssignmentRow): MeetingRoleAssignee {
  if (row.assigneeKind === 'member') {
    return { kind: 'member', personId: row.assigneePersonId! };
  }
  if (row.assigneeKind === 'cross_club') {
    return {
      kind: 'cross_club',
      personId: row.assigneePersonId!,
      homeClubUnitId: row.assigneeHomeClubUnitId!,
    };
  }
  if (row.assigneeKind === 'guest') {
    return { kind: 'guest', guestId: row.assigneeGuestId! };
  }
  return { kind: 'unfilled' };
}

function toMeetingRoleAssignment(row: MeetingRoleAssignmentRow): MeetingRoleAssignment {
  return {
    id: row.id,
    meetingId: row.meetingId,
    roleKey: row.roleKey,
    slotIndex: row.slotIndex,
    assignee: toAssignee(row),
    status: row.status,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    declinedReason: row.declinedReason,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MeetingRoleAssignmentRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** Created `proposed` — status transitions are a later slice (M3 Slice 3 scoping). */
  async create(input: {
    meetingId: string;
    roleKey: MeetingRoleAssignment['roleKey'];
    slotIndex?: number;
    assignee: MeetingRoleAssignee;
  }): Promise<MeetingRoleAssignment> {
    const row = await this.db.meetingRoleAssignment.create({
      data: {
        meetingId: input.meetingId,
        roleKey: input.roleKey,
        slotIndex: input.slotIndex ?? null,
        assigneeKind: input.assignee.kind,
        assigneePersonId:
          input.assignee.kind === 'member' || input.assignee.kind === 'cross_club'
            ? input.assignee.personId
            : null,
        assigneeHomeClubUnitId:
          input.assignee.kind === 'cross_club' ? input.assignee.homeClubUnitId : null,
        assigneeGuestId: input.assignee.kind === 'guest' ? input.assignee.guestId : null,
      },
    });
    return toMeetingRoleAssignment(row);
  }

  /** M3 Slice 11: the status transitions Slice 3 deferred — a proposed assignment is confirmed or declined by the assignee/officer. `fulfilled` is set only by guarded close-out. */
  async updateStatus(input: {
    id: string;
    status: 'confirmed' | 'declined';
    declinedReason?: string;
  }): Promise<MeetingRoleAssignment> {
    const row = await this.db.meetingRoleAssignment.update({
      where: { id: input.id },
      data: {
        status: input.status,
        confirmedAt: input.status === 'confirmed' ? new Date() : null,
        declinedReason: input.status === 'declined' ? (input.declinedReason ?? null) : null,
      },
    });
    return toMeetingRoleAssignment(row);
  }

  async findById(id: string): Promise<MeetingRoleAssignment | null> {
    const row = await this.db.meetingRoleAssignment.findUnique({ where: { id } });
    return row ? toMeetingRoleAssignment(row) : null;
  }

  /**
   * M9: withdraw a role proposal.
   *
   * Only ever called for a `proposed` assignment — the controller enforces
   * that. A proposal nobody has answered is planning scratch, not a fact,
   * so removing it loses nothing. Once the assignee has *answered*
   * (confirmed/declined) or the meeting has closed (fulfilled/no_show) the
   * row is history and must be superseded by a status change instead.
   */
  async deleteProposed(id: string): Promise<void> {
    await this.db.meetingRoleAssignment.delete({ where: { id } });
  }

  async findByMeeting(meetingId: string): Promise<MeetingRoleAssignment[]> {
    const rows = await this.db.meetingRoleAssignment.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMeetingRoleAssignment);
  }
}
