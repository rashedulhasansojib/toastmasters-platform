import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { MeetingLiveRecord } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingLiveRecordRow = Awaited<ReturnType<PrismaClient['meetingLiveRecord']['create']>>;

function toMeetingLiveRecord(row: MeetingLiveRecordRow): MeetingLiveRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    kind: row.kind,
    clientKey: row.clientKey,
    targetRoleAssignmentId: row.targetRoleAssignmentId,
    targetLabel: row.targetLabel,
    payload: row.payload as Record<string, unknown>,
    recordedBy: row.recordedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MeetingLiveRecordRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** Idempotent on (meetingId, clientKey) — a replayed write after a wifi drop returns the original record unchanged, never a duplicate (FR-MTG-6/NFR-3). */
  async create(input: {
    meetingId: string;
    kind: MeetingLiveRecord['kind'];
    clientKey: string;
    targetRoleAssignmentId?: string;
    targetLabel?: string;
    payload: Record<string, unknown>;
    recordedBy: string;
  }): Promise<MeetingLiveRecord> {
    const row = await this.db.meetingLiveRecord.upsert({
      where: { meetingId_clientKey: { meetingId: input.meetingId, clientKey: input.clientKey } },
      create: {
        meetingId: input.meetingId,
        kind: input.kind,
        clientKey: input.clientKey,
        targetRoleAssignmentId: input.targetRoleAssignmentId ?? null,
        targetLabel: input.targetLabel ?? null,
        payload: input.payload as never,
        recordedBy: input.recordedBy,
      },
      update: {},
    });
    return toMeetingLiveRecord(row);
  }

  async findByMeeting(meetingId: string): Promise<MeetingLiveRecord[]> {
    const rows = await this.db.meetingLiveRecord.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMeetingLiveRecord);
  }
}
