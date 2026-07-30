import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import {
  tableTopicQuestion,
  wordOfDay,
  type Meeting,
  type MeetingStatus,
  type TableTopicQuestion,
  type WordOfDay,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { SpeechApprovalRepository } from '../education/speech-approval.repository';
import { EducationRecordRepository } from '../education/education-record.repository';

type MeetingRow = Awaited<ReturnType<PrismaClient['meeting']['update']>>;

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
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly speechApprovals: SpeechApprovalRepository,
    private readonly educationRecords: EducationRecordRepository,
  ) {}

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

      // M11 Slice 1: auto-request a VPE education-credit approval for every
      // approved speech slot on this meeting. Runs inside the same tx so the
      // meeting either persists its 'closed' state and the pending requests,
      // or neither; the unique on speech_slot_id keeps this idempotent if
      // the meeting were ever re-closed.
      await this.speechApprovals.createManyForMeeting(
        tx,
        { clubUnitId: meeting.clubUnitId, scheduledAt: meeting.scheduledAt },
        meetingId,
      );

      // M12: auto-start an EducationRecord for every prepared speaker on
      // this meeting who doesn't have one yet for the path they spoke on.
      // Same transaction, same idempotence guarantee as the SpeechApproval
      // hook above — a re-close inserts zero rows.
      await this.educationRecords.ensureStartedForMeeting(
        tx,
        { clubUnitId: meeting.clubUnitId, scheduledAt: meeting.scheduledAt },
        meetingId,
      );

      const row = await tx.meeting.update({ where: { id: meetingId }, data: { status: 'closed' } });
      return toMeeting(row);
    });
  }
}
