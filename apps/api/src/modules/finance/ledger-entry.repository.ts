import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { LedgerEntry, LedgerCounterpartyKind, LedgerDirection } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type LedgerEntryRow = Awaited<ReturnType<PrismaClient['ledgerEntry']['create']>>;

function toLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    direction: row.direction,
    category: row.category,
    amount: row.amount.toNumber(),
    currency: row.currency,
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    counterpartyKind: row.counterpartyKind,
    counterpartyRef: row.counterpartyRef,
    counterpartyLabel: row.counterpartyLabel,
    description: row.description,
    receiptUrl: row.receiptUrl,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
    reversalOfEntryId: row.reversalOfEntryId,
  };
}

@Injectable()
export class LedgerEntryRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    direction: LedgerDirection;
    category: string;
    amount: number;
    currency: string;
    occurredOn: Date;
    counterpartyKind: LedgerCounterpartyKind;
    counterpartyRef?: string;
    counterpartyLabel: string;
    description: string;
    receiptUrl?: string;
    recordedBy: string;
    reversalOfEntryId?: string;
  }): Promise<LedgerEntry> {
    const row = await this.db.ledgerEntry.create({ data: input });
    return toLedgerEntry(row);
  }

  async findByClub(orgUnitId: string): Promise<LedgerEntry[]> {
    const rows = await this.db.ledgerEntry.findMany({
      where: { orgUnitId },
      orderBy: { occurredOn: 'desc' },
    });
    return rows.map(toLedgerEntry);
  }

  async findById(id: string): Promise<LedgerEntry | null> {
    const row = await this.db.ledgerEntry.findUnique({ where: { id } });
    return row ? toLedgerEntry(row) : null;
  }

  /** M4 Slice 9: opening-balance input for `FinancialReportService` — every entry strictly before a report's period start. */
  async findByClubBefore(orgUnitId: string, before: Date): Promise<LedgerEntry[]> {
    const rows = await this.db.ledgerEntry.findMany({
      where: { orgUnitId, occurredOn: { lt: before } },
    });
    return rows.map(toLedgerEntry);
  }

  /** M4 Slice 9: income/expense-by-category input for `FinancialReportService` — inclusive of both endpoints. */
  async findByClubInRange(orgUnitId: string, from: Date, to: Date): Promise<LedgerEntry[]> {
    const rows = await this.db.ledgerEntry.findMany({
      where: { orgUnitId, occurredOn: { gte: from, lte: to } },
    });
    return rows.map(toLedgerEntry);
  }
}
