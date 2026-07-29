import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  MeetingAttendanceRecord,
  MeetingAttendanceRosterEntry,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingAttendanceRow = Awaited<ReturnType<PrismaClient['meetingAttendanceRecord']['create']>>;

function toRecord(row: MeetingAttendanceRow): MeetingAttendanceRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    personId: row.personId,
    present: row.present,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
  };
}

/**
 * M9 Slice 3: member attendance.
 *
 * Append-only (NFR-4, `REVOKE UPDATE, DELETE` in the migration): marking a
 * member absent after marking them present inserts a *correcting* row. All
 * reads therefore go through "latest row per person".
 */
@Injectable()
export class MeetingAttendanceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** One `createMany` per save so a whole roster toggle is a single round trip. */
  async record(input: {
    meetingId: string;
    entries: { personId: string; present: boolean }[];
    recordedBy: string;
  }): Promise<MeetingAttendanceRecord[]> {
    const created = await this.db.meetingAttendanceRecord.createManyAndReturn({
      data: input.entries.map((entry) => ({
        meetingId: input.meetingId,
        personId: entry.personId,
        present: entry.present,
        recordedBy: input.recordedBy,
      })),
    });
    return created.map(toRecord);
  }

  /**
   * The roster the Attendance tab renders: every active member of the club,
   * left-joined to their latest attendance row for this meeting.
   *
   * `DISTINCT ON` keeps this one query rather than one-per-member, and the
   * ordering matches the `(meeting_id, person_id, recorded_at)` index.
   * A member nobody has marked yet comes back `present: false` with a null
   * `recordedAt` — "not taken", which the UI shows differently from "absent".
   */
  async roster(clubUnitId: string, meetingId: string): Promise<MeetingAttendanceRosterEntry[]> {
    return this.db.$queryRaw<MeetingAttendanceRosterEntry[]>`
      SELECT
        cm.person_id                       AS "personId",
        p.full_name                        AS "fullName",
        COALESCE(latest.present, FALSE)    AS "present",
        latest.recorded_at                 AS "recordedAt"
      FROM club_membership cm
      JOIN person p ON p.id = cm.person_id
      LEFT JOIN LATERAL (
        SELECT r.present, r.recorded_at
        FROM meeting_attendance_record r
        WHERE r.meeting_id = ${meetingId}::uuid
          AND r.person_id = cm.person_id
        ORDER BY r.recorded_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE cm.club_unit_id = ${clubUnitId}::uuid
        AND cm.left_at IS NULL
      ORDER BY p.full_name ASC
    `;
  }

  /** The raw append-only history — every row, including superseded ones. */
  async history(meetingId: string): Promise<MeetingAttendanceRecord[]> {
    const rows = await this.db.meetingAttendanceRecord.findMany({
      where: { meetingId },
      orderBy: { recordedAt: 'asc' },
    });
    return rows.map(toRecord);
  }
}
