import { BadRequestException, Injectable } from '@nestjs/common';
import type { DuesRecord, DuesRecordStatus } from '@toastmasters/contracts';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { ClubDuesSettingsRepository } from './club-dues-settings.repository';
import { DuesRecordRepository } from './dues-record.repository';

/**
 * M4 Slice 6: system-design.md §12.1. `deriveStatus` is the "explicit
 * handler, not a stored status flag" CLAUDE.md §6/`FR-FIN-3` calls for —
 * every write to `status` goes through this pure function, never an ad hoc
 * assignment. `lapsed` is intentionally unreachable here (see the schema
 * comment on `DuesRecordStatus` — no deadline job exists yet).
 */
export function deriveDuesStatus(input: {
  tiAmountDue: number;
  tiAmountPaid: number;
  localAmountDue: number;
  localAmountPaid: number;
}): DuesRecordStatus {
  const totalDue = input.tiAmountDue + input.localAmountDue;
  const totalPaid = input.tiAmountPaid + input.localAmountPaid;
  if (totalDue === 0) return 'waived';
  if (totalPaid >= totalDue) return 'paid';
  if (totalPaid > 0) return 'partial';
  return 'due';
}

@Injectable()
export class DuesRecordService {
  constructor(
    private readonly duesRecords: DuesRecordRepository,
    private readonly clubMemberships: ClubMembershipRepository,
    private readonly ledgerEntries: LedgerEntryRepository,
    private readonly duesSettings: ClubDuesSettingsRepository,
  ) {}

  list(orgUnitId: string, duesPeriod?: string): Promise<DuesRecord[]> {
    return this.duesRecords.findByClub(orgUnitId, duesPeriod);
  }

  findById(id: string): Promise<DuesRecord | null> {
    return this.duesRecords.findById(id);
  }

  /** Skips any membership that already has a record for this period — safe to call more than once for the same period (e.g. after a late-joining member). */
  async generate(orgUnitId: string, input: { duesPeriod: string; programYearId: string }) {
    const settings = await this.duesSettings.find(orgUnitId);
    const currency = settings.currency ?? 'USD';
    const tiAmountDue = settings.tiDuesAmount ?? 0;
    const localAmountDue = settings.localDuesAmount ?? 0;

    const activeMemberships = await this.clubMemberships.findActiveByClub(orgUnitId);
    const created: DuesRecord[] = [];
    for (const membership of activeMemberships) {
      const existing = await this.duesRecords.findByMembershipAndPeriod(
        membership.id,
        input.duesPeriod,
      );
      if (existing) continue;
      created.push(
        await this.duesRecords.create({
          orgUnitId,
          clubMembershipId: membership.id,
          personId: membership.personId,
          duesPeriod: input.duesPeriod,
          programYearId: input.programYearId,
          tiAmountDue,
          tiCurrency: currency,
          localAmountDue,
          localCurrency: currency,
          status: deriveDuesStatus({
            tiAmountDue,
            tiAmountPaid: 0,
            localAmountDue,
            localAmountPaid: 0,
          }),
        }),
      );
    }
    return created;
  }

  async recordPayment(input: {
    orgUnitId: string;
    duesRecordId: string;
    scope: 'ti' | 'local';
    amount: number;
    ledgerEntryId: string;
  }): Promise<DuesRecord> {
    const record = await this.duesRecords.findById(input.duesRecordId);
    if (!record || record.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Dues record not found');
    }
    const ledgerEntry = await this.ledgerEntries.findById(input.ledgerEntryId);
    if (!ledgerEntry || ledgerEntry.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Ledger entry not found for this club');
    }
    if (record.ledgerEntryIds.includes(input.ledgerEntryId)) {
      throw new BadRequestException('This ledger entry is already linked to this dues record');
    }

    const tiAmountPaid = record.tiAmountPaid + (input.scope === 'ti' ? input.amount : 0);
    const localAmountPaid = record.localAmountPaid + (input.scope === 'local' ? input.amount : 0);
    const status = deriveDuesStatus({
      tiAmountDue: record.tiAmountDue,
      tiAmountPaid,
      localAmountDue: record.localAmountDue,
      localAmountPaid,
    });
    const scopeFullyPaid =
      input.scope === 'ti'
        ? tiAmountPaid >= record.tiAmountDue
        : localAmountPaid >= record.localAmountDue;

    return this.duesRecords.recordPayment(input.duesRecordId, {
      scope: input.scope,
      amount: input.amount,
      ledgerEntryId: input.ledgerEntryId,
      status,
      paidAt: scopeFullyPaid ? new Date() : undefined,
    });
  }
}
