import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type {
  FinancialReport,
  FinancialReportCategoryAmount,
  GenerateFinancialReportRequest,
} from '@toastmasters/contracts';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { DuesRecordRepository } from './dues-record.repository';
import { FinancialReportRepository } from './financial-report.repository';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function signedAmount(direction: 'in' | 'out', amount: number): number {
  return direction === 'in' ? amount : -amount;
}

function sumByCategory(
  entries: Array<{ category: string; amount: number }>,
): FinancialReportCategoryAmount[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.category, round2((totals.get(entry.category) ?? 0) + entry.amount));
  }
  return [...totals.entries()].map(([category, amount]) => ({ category, amount }));
}

/**
 * M4 Slice 9: system-design.md §12.4. Every figure is computed once, here,
 * from the real ledger/dues/membership data — a "frozen snapshot, not a
 * saved query." Scope cuts (documented in the milestone plan, not hidden):
 * `duesSummary`/`memberCounts` are computed across the whole `programYearId`
 * (not the report's specific `periodFrom`/`periodTo` window), since
 * `DuesRecord` and `ClubMembership` don't carry a fine-grained "as of" query
 * the way ledger entries do; no `snapshotUrl` PDF is rendered (same deferral
 * as invoices).
 */
@Injectable()
export class FinancialReportService {
  constructor(
    private readonly reports: FinancialReportRepository,
    private readonly ledgerEntries: LedgerEntryRepository,
    private readonly duesRecords: DuesRecordRepository,
    private readonly clubMemberships: ClubMembershipRepository,
  ) {}

  list(orgUnitId: string): Promise<FinancialReport[]> {
    return this.reports.findByClub(orgUnitId);
  }

  findById(id: string): Promise<FinancialReport | null> {
    return this.reports.findById(id);
  }

  async generate(
    orgUnitId: string,
    input: GenerateFinancialReportRequest & { generatedBy: string },
  ): Promise<FinancialReport> {
    const periodFrom = new Date(input.periodFrom);
    const periodTo = new Date(input.periodTo);
    if (periodFrom > periodTo) {
      throw new BadRequestException('periodFrom must be on or before periodTo');
    }

    const [before, inRange, duesRecords, memberships] = await Promise.all([
      this.ledgerEntries.findByClubBefore(orgUnitId, periodFrom),
      this.ledgerEntries.findByClubInRange(orgUnitId, periodFrom, periodTo),
      this.duesRecords.findByClub(orgUnitId),
      this.clubMemberships.findAllByClub(orgUnitId),
    ]);

    const openingBalance = round2(
      before.reduce((sum, e) => sum + signedAmount(e.direction, e.amount), 0),
    );
    const periodNet = round2(
      inRange.reduce((sum, e) => sum + signedAmount(e.direction, e.amount), 0),
    );
    const closingBalance = round2(openingBalance + periodNet);
    const currency = before[0]?.currency ?? inRange[0]?.currency ?? 'USD';

    const income = sumByCategory(inRange.filter((e) => e.direction === 'in'));
    const expenses = sumByCategory(inRange.filter((e) => e.direction === 'out'));

    const yearRecords = duesRecords.filter((d) => d.programYearId === input.programYearId);
    const duesSummary = {
      billed: round2(yearRecords.reduce((s, d) => s + d.tiAmountDue + d.localAmountDue, 0)),
      collected: round2(yearRecords.reduce((s, d) => s + d.tiAmountPaid + d.localAmountPaid, 0)),
      outstanding: round2(
        yearRecords.reduce(
          (s, d) => s + (d.tiAmountDue - d.tiAmountPaid) + (d.localAmountDue - d.localAmountPaid),
          0,
        ),
      ),
      waived: round2(
        yearRecords
          .filter((d) => d.status === 'waived')
          .reduce((s, d) => s + d.tiAmountDue + d.localAmountDue, 0),
      ),
    };

    const activeAt = (date: Date) =>
      memberships.filter(
        (m) => new Date(m.joinedAt) <= date && (!m.leftAt || new Date(m.leftAt) > date),
      ).length;
    const memberCounts = {
      start: activeAt(periodFrom),
      end: activeAt(periodTo),
      paid: yearRecords.filter((d) => d.status === 'paid').length,
      unpaid: yearRecords.filter((d) => d.status === 'due' || d.status === 'partial').length,
    };

    return this.reports.create({
      orgUnitId,
      programYearId: input.programYearId,
      type: input.type,
      periodFrom,
      periodTo,
      openingBalance,
      closingBalance,
      currency,
      income,
      expenses,
      duesSummary,
      memberCounts,
      narrative: input.narrative,
      generatedBy: input.generatedBy,
    });
  }

  async finalize(
    orgUnitId: string,
    reportId: string,
    approvedBy: string,
  ): Promise<FinancialReport> {
    const report = await this.reports.findById(reportId);
    if (!report || report.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Financial report not found');
    }
    if (report.status === 'final') {
      throw new ConflictException('Report is already final');
    }
    return this.reports.finalize(reportId, approvedBy);
  }
}
