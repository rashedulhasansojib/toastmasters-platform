import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Meeting, MeetingStatus } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingRow = Awaited<ReturnType<PrismaClient['meeting']['update']>>;

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

/**
 * M3 Slice 11: system-design.md §9.5's lifecycle. `reopen` is deferred — it
 * needs a required-reason audit trail this slice doesn't build. `publish`'s
 * "checklist run created" / "role invitations sent" and `start`'s "tools go
 * live" are UX-surface effects with no state to persist here, not
 * transition guards — skipped. `close` emits no domain events
 * (`MeetingHeld` etc., §9.5) since no event bus exists yet; its two real,
 * persisted effects — role fulfillment and token revocation — happen
 * directly in the same transaction.
 */
@Injectable()
export class MeetingLifecycleRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  private async transition(
    meetingId: string,
    from: MeetingStatus[],
    to: MeetingStatus,
  ): Promise<Meeting> {
    return this.db.$transaction(async (tx) => {
      const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
      if (!from.includes(meeting.status)) {
        throw new BadRequestException(`Cannot transition meeting from ${meeting.status} to ${to}`);
      }
      const row = await tx.meeting.update({ where: { id: meetingId }, data: { status: to } });
      return toMeeting(row);
    });
  }

  publish(meetingId: string): Promise<Meeting> {
    return this.transition(meetingId, ['draft'], 'published');
  }

  start(meetingId: string): Promise<Meeting> {
    return this.transition(meetingId, ['published'], 'in_progress');
  }

  cancel(meetingId: string): Promise<Meeting> {
    return this.transition(meetingId, ['draft', 'published', 'in_progress'], 'cancelled');
  }

  /** Guard: no `proposed` role assignments remain (system-design.md §9.5). */
  async close(meetingId: string): Promise<Meeting> {
    return this.db.$transaction(async (tx) => {
      const meeting = await tx.meeting.findUniqueOrThrow({ where: { id: meetingId } });
      if (meeting.status !== 'in_progress') {
        throw new BadRequestException(`Cannot close a meeting in status ${meeting.status}`);
      }

      const proposedCount = await tx.meetingRoleAssignment.count({
        where: { meetingId, status: 'proposed' },
      });
      if (proposedCount > 0) {
        throw new BadRequestException(
          `Cannot close: ${proposedCount} proposed role assignment(s) remain`,
        );
      }

      await tx.meetingRoleAssignment.updateMany({
        where: { meetingId, status: 'confirmed' },
        data: { status: 'fulfilled', fulfilledAt: new Date() },
      });
      await tx.capabilityToken.updateMany({
        where: { meetingId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const row = await tx.meeting.update({ where: { id: meetingId }, data: { status: 'closed' } });
      return toMeeting(row);
    });
  }
}
