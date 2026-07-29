import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ClubHealthSnapshot } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ClubHealthSnapshotRow = Awaited<ReturnType<PrismaClient['clubHealthSnapshot']['findFirst']>>;

function toClubHealthSnapshot(row: NonNullable<ClubHealthSnapshotRow>): ClubHealthSnapshot {
  return {
    id: row.id,
    clubUnitId: row.clubUnitId,
    yearMonth: row.yearMonth,
    meetingsHeld: row.meetingsHeld,
    attendanceAvg: row.attendanceAvg?.toNumber() ?? null,
    memberCount: row.memberCount,
    guestCount: row.guestCount,
    rolesFilledPct: row.rolesFilledPct.toNumber(),
    speechesGiven: row.speechesGiven,
    computedAt: row.computedAt.toISOString(),
  };
}

@Injectable()
export class ClubHealthSnapshotRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async findByClub(clubUnitId: string): Promise<ClubHealthSnapshot[]> {
    const rows = await this.db.clubHealthSnapshot.findMany({
      where: { clubUnitId },
      orderBy: { yearMonth: 'desc' },
    });
    return rows.map(toClubHealthSnapshot);
  }
}
