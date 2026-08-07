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
    targetKey: row.targetKey,
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

  /**
   * Idempotent on (meetingId, clientKey) — a replayed *attempt* after a wifi
   * drop returns the original record unchanged, never a duplicate
   * (FR-MTG-6/NFR-3). `update: {}` is the whole point: the table is
   * append-only (NFR-4) and Postgres denies UPDATE on it outright.
   *
   * A genuine re-save carries a fresh `clientKey` with the same `targetKey`,
   * so it inserts a new row and supersedes the old one on read. Reusing a
   * `clientKey` across saves is what previously made corrections vanish.
   */
  async create(input: {
    meetingId: string;
    kind: MeetingLiveRecord['kind'];
    clientKey: string;
    targetKey: string;
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
        targetKey: input.targetKey,
        targetRoleAssignmentId: input.targetRoleAssignmentId ?? null,
        targetLabel: input.targetLabel ?? null,
        payload: input.payload as never,
        recordedBy: input.recordedBy,
      },
      update: {},
    });
    return toMeetingLiveRecord(row);
  }

  /**
   * The read model: the newest row per (kind, targetKey), superseded
   * revisions left in place as history. Deduplicated in the query via
   * `DISTINCT ON` rather than by fetching everything and discarding rows in
   * application code.
   */
  async findLatestByMeeting(meetingId: string): Promise<MeetingLiveRecord[]> {
    const rows = await this.db.$queryRaw<MeetingLiveRecordRow[]>`
      SELECT DISTINCT ON ("kind", "target_key")
             "id",
             "meeting_id"                 AS "meetingId",
             "kind",
             "client_key"                 AS "clientKey",
             "target_key"                 AS "targetKey",
             "target_role_assignment_id"  AS "targetRoleAssignmentId",
             "target_label"               AS "targetLabel",
             "payload",
             "recorded_by"                AS "recordedBy",
             "created_at"                 AS "createdAt"
        FROM "meeting_live_record"
       WHERE "meeting_id" = ${meetingId}::uuid
       ORDER BY "kind", "target_key", "created_at" DESC, "id" DESC
    `;
    return rows
      .map(toMeetingLiveRecord)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  /** Full append-only history for a target, newest first. */
  async findHistory(meetingId: string, targetKey: string): Promise<MeetingLiveRecord[]> {
    const rows = await this.db.meetingLiveRecord.findMany({
      where: { meetingId, targetKey },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toMeetingLiveRecord);
  }
}
