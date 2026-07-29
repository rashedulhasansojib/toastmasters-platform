import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@toastmasters/db';

export const CLUB_HEALTH_SNAPSHOT_QUEUE = 'club-health-snapshot';

/**
 * M6 Slice 4: system-design.md §19.4. Monthly, immutable club-level
 * aggregate for the Area dashboard's club cards — never member detail
 * (FR-OVS-3). Runs on the 1st for the just-completed calendar month.
 * `attendanceAvg` stays null — no member-level attendance fact exists
 * anywhere in the schema (see the schema comment on `ClubHealthSnapshot`).
 */
@Processor(CLUB_HEALTH_SNAPSHOT_QUEUE)
export class ClubHealthSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(ClubHealthSnapshotProcessor.name);

  async process(_job: Job): Promise<{ clubsProcessed: number }> {
    const db = getPrisma();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearMonth = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;

    const clubs = await db.orgUnit.findMany({ where: { type: 'club' }, select: { id: true } });
    let processed = 0;

    for (const club of clubs) {
      const meetings = await db.meeting.findMany({
        where: {
          clubUnitId: club.id,
          status: 'closed',
          scheduledAt: { gte: monthStart, lt: monthEnd },
        },
        select: { id: true },
      });
      const meetingIds = meetings.map((m) => m.id);

      const memberCount = await db.clubMembership.count({
        where: { clubUnitId: club.id, localStatus: 'active' },
      });

      const guestCount = meetingIds.length
        ? await db.guestVisit.count({ where: { meetingId: { in: meetingIds } } })
        : 0;

      const roleAssignments = meetingIds.length
        ? await db.meetingRoleAssignment.findMany({
            where: { meetingId: { in: meetingIds } },
            select: { status: true },
          })
        : [];
      const rolesFilledPct =
        roleAssignments.length === 0
          ? 0
          : (roleAssignments.filter((r) => r.status === 'fulfilled').length /
              roleAssignments.length) *
            100;

      const speechesGiven = meetingIds.length
        ? await db.speechSlot.count({
            where: { meetingId: { in: meetingIds }, status: 'approved' },
          })
        : 0;

      await db.clubHealthSnapshot.upsert({
        where: { clubUnitId_yearMonth: { clubUnitId: club.id, yearMonth } },
        create: {
          clubUnitId: club.id,
          yearMonth,
          meetingsHeld: meetings.length,
          attendanceAvg: null,
          memberCount,
          guestCount,
          rolesFilledPct,
          speechesGiven,
        },
        update: {
          meetingsHeld: meetings.length,
          memberCount,
          guestCount,
          rolesFilledPct,
          speechesGiven,
          computedAt: new Date(),
        },
      });
      processed += 1;
    }

    this.logger.log({ clubsProcessed: processed, yearMonth }, 'club health snapshot job ran');
    return { clubsProcessed: processed };
  }
}
