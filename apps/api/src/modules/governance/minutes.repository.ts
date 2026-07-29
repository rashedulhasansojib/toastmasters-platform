import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Minutes, MinutesSourceKind, MinutesVisibility } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MinutesRow = Awaited<ReturnType<PrismaClient['minutes']['create']>>;

function toMinutes(row: MinutesRow): Minutes {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    sourceKind: row.sourceKind,
    excomMeetingId: row.excomMeetingId,
    clubMeetingId: row.clubMeetingId,
    draftedBy: row.draftedBy,
    draftedAt: row.draftedAt.toISOString(),
    body: row.body,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedByPersonId: row.approvedByPersonId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    libraryItemId: row.libraryItemId,
    visibility: row.visibility,
    version: row.version,
    supersedesId: row.supersedesId,
  };
}

@Injectable()
export class MinutesRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    sourceKind: MinutesSourceKind;
    excomMeetingId?: string;
    clubMeetingId?: string;
    draftedBy: string;
    body: string;
    visibility: MinutesVisibility;
    supersedesId?: string;
    version?: number;
  }): Promise<Minutes> {
    const row = await this.db.minutes.create({ data: input });
    return toMinutes(row);
  }

  async findById(id: string): Promise<Minutes | null> {
    const row = await this.db.minutes.findUnique({ where: { id } });
    return row ? toMinutes(row) : null;
  }

  async findByClub(orgUnitId: string): Promise<Minutes[]> {
    const rows = await this.db.minutes.findMany({
      where: { orgUnitId },
      orderBy: { draftedAt: 'desc' },
    });
    return rows.map(toMinutes);
  }

  async approve(id: string, approvedByPersonId: string): Promise<Minutes> {
    const row = await this.db.minutes.update({
      where: { id },
      data: { approvedAt: new Date(), approvedByPersonId },
    });
    return toMinutes(row);
  }

  async publish(id: string, libraryItemId: string): Promise<Minutes> {
    const row = await this.db.minutes.update({
      where: { id },
      data: { publishedAt: new Date(), libraryItemId },
    });
    return toMinutes(row);
  }
}
