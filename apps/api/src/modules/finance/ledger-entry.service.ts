import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { CreateLedgerEntryRequest, LedgerEntry } from '@toastmasters/contracts';
import { LedgerEntryRepository } from './ledger-entry.repository';

/**
 * M4 Slice 5: system-design.md §12.1. The ledger is append-only at the DB
 * layer (migration's `REVOKE UPDATE, DELETE`) — this service only ever adds
 * rows, including for corrections.
 */
@Injectable()
export class LedgerEntryService {
  constructor(private readonly entries: LedgerEntryRepository) {}

  create(input: { orgUnitId: string; recordedBy: string } & CreateLedgerEntryRequest) {
    return this.entries.create({
      orgUnitId: input.orgUnitId,
      programYearId: input.programYearId,
      direction: input.direction,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      occurredOn: new Date(input.occurredOn),
      counterpartyKind: input.counterpartyKind,
      counterpartyRef: input.counterpartyRef,
      counterpartyLabel: input.counterpartyLabel,
      description: input.description,
      receiptUrl: input.receiptUrl,
      recordedBy: input.recordedBy,
    });
  }

  list(orgUnitId: string): Promise<LedgerEntry[]> {
    return this.entries.findByClub(orgUnitId);
  }

  findById(id: string): Promise<LedgerEntry | null> {
    return this.entries.findById(id);
  }

  /** Direction/amount/currency/counterparty are copied from the original — never client-supplied, so a reversal always exactly cancels what it reverses. */
  async reverse(input: {
    orgUnitId: string;
    entryId: string;
    reason: string;
    recordedBy: string;
  }): Promise<LedgerEntry> {
    const original = await this.entries.findById(input.entryId);
    if (!original || original.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Ledger entry not found');
    }
    if (original.reversalOfEntryId) {
      throw new BadRequestException('Cannot reverse a reversal — reverse the original entry');
    }

    try {
      return await this.entries.create({
        orgUnitId: original.orgUnitId,
        programYearId: original.programYearId,
        direction: original.direction === 'in' ? 'out' : 'in',
        category: original.category,
        amount: original.amount,
        currency: original.currency,
        occurredOn: new Date(),
        counterpartyKind: original.counterpartyKind,
        counterpartyRef: original.counterpartyRef ?? undefined,
        counterpartyLabel: original.counterpartyLabel,
        description: `Reversal of ${original.id}: ${input.reason}`,
        recordedBy: input.recordedBy,
        reversalOfEntryId: original.id,
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('This entry has already been reversed');
      }
      throw err;
    }
  }
}
