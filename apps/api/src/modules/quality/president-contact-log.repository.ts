import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { PresidentContactLog, PresidentContactMethod } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type PresidentContactLogRow = Awaited<ReturnType<PrismaClient['presidentContactLog']['create']>>;

function toPresidentContactLog(row: PresidentContactLogRow): PresidentContactLog {
  return {
    id: row.id,
    areaUnitId: row.areaUnitId,
    clubUnitId: row.clubUnitId,
    programYearId: row.programYearId,
    month: row.month,
    contactedAt: row.contactedAt.toISOString(),
    byPersonId: row.byPersonId,
    method: row.method,
    dcpDiscussed: row.dcpDiscussed,
    note: row.note,
  };
}

@Injectable()
export class PresidentContactLogRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    areaUnitId: string;
    clubUnitId: string;
    programYearId: string;
    month: string;
    contactedAt: Date;
    byPersonId: string;
    method: PresidentContactMethod;
    dcpDiscussed: boolean;
    note?: string;
  }): Promise<PresidentContactLog> {
    const row = await this.db.presidentContactLog.create({ data: input });
    return toPresidentContactLog(row);
  }

  async findByClub(clubUnitId: string): Promise<PresidentContactLog[]> {
    const rows = await this.db.presidentContactLog.findMany({
      where: { clubUnitId },
      orderBy: { contactedAt: 'desc' },
    });
    return rows.map(toPresidentContactLog);
  }
}
