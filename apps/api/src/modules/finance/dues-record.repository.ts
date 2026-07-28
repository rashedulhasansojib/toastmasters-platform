import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { DuesRecord, DuesRecordStatus } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type DuesRecordRow = Awaited<ReturnType<PrismaClient['duesRecord']['create']>>;

function toDuesRecord(row: DuesRecordRow): DuesRecord {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    clubMembershipId: row.clubMembershipId,
    personId: row.personId,
    duesPeriod: row.duesPeriod,
    programYearId: row.programYearId,
    tiAmountDue: row.tiAmountDue.toNumber(),
    tiAmountPaid: row.tiAmountPaid.toNumber(),
    tiCurrency: row.tiCurrency,
    tiPaidAt: row.tiPaidAt?.toISOString() ?? null,
    tiSubmittedToWhqAt: row.tiSubmittedToWhqAt?.toISOString() ?? null,
    localAmountDue: row.localAmountDue.toNumber(),
    localAmountPaid: row.localAmountPaid.toNumber(),
    localCurrency: row.localCurrency,
    localPaidAt: row.localPaidAt?.toISOString() ?? null,
    status: row.status,
    ledgerEntryIds: row.ledgerEntryIds,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class DuesRecordRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    clubMembershipId: string;
    personId: string;
    duesPeriod: string;
    programYearId: string;
    tiAmountDue: number;
    tiCurrency: string;
    localAmountDue: number;
    localCurrency: string;
    status: DuesRecordStatus;
  }): Promise<DuesRecord> {
    const row = await this.db.duesRecord.create({ data: input });
    return toDuesRecord(row);
  }

  async findByClub(orgUnitId: string, duesPeriod?: string): Promise<DuesRecord[]> {
    const rows = await this.db.duesRecord.findMany({
      where: { orgUnitId, ...(duesPeriod ? { duesPeriod } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDuesRecord);
  }

  async findById(id: string): Promise<DuesRecord | null> {
    const row = await this.db.duesRecord.findUnique({ where: { id } });
    return row ? toDuesRecord(row) : null;
  }

  async findByMembershipAndPeriod(
    clubMembershipId: string,
    duesPeriod: string,
  ): Promise<DuesRecord | null> {
    const row = await this.db.duesRecord.findUnique({
      where: { clubMembershipId_duesPeriod: { clubMembershipId, duesPeriod } },
    });
    return row ? toDuesRecord(row) : null;
  }

  /** `paidAt` is only passed when this payment brings that scope's amount fully paid — omitted (never cleared) otherwise. */
  async recordPayment(
    id: string,
    input: {
      scope: 'ti' | 'local';
      amount: number;
      ledgerEntryId: string;
      status: DuesRecordStatus;
      paidAt?: Date;
    },
  ): Promise<DuesRecord> {
    const row = await this.db.duesRecord.update({
      where: { id },
      data: {
        ...(input.scope === 'ti'
          ? {
              tiAmountPaid: { increment: input.amount },
              ...(input.paidAt && { tiPaidAt: input.paidAt }),
            }
          : {
              localAmountPaid: { increment: input.amount },
              ...(input.paidAt && { localPaidAt: input.paidAt }),
            }),
        status: input.status,
        ledgerEntryIds: { push: input.ledgerEntryId },
      },
    });
    return toDuesRecord(row);
  }
}
