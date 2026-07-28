import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type {
  CreateInstallmentPlanRequest,
  InstallmentPlan,
  InstallmentScheduleEntry,
} from '@toastmasters/contracts';
import { DuesRecordRepository } from './dues-record.repository';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { InstallmentPlanRepository } from './installment-plan.repository';

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Splits `total` into `count` two-decimal amounts summing exactly to `total` — the last share absorbs the rounding remainder. */
function splitEvenly(total: number, count: number): number[] {
  const share = Math.round((total / count) * 100) / 100;
  const shares = Array<number>(count).fill(share);
  const remainder = Math.round((total - share * count) * 100) / 100;
  shares[count - 1] = Math.round((share + remainder) * 100) / 100;
  return shares;
}

/**
 * M4 Slice 8: builds a schedule where any outstanding TI amount is an
 * immediately-due entry ahead of the local instalments (front-loaded — see
 * the schema comment on `InstallmentPlan` for the design-text reasoning),
 * and asserts I-14 (`SUM(schedule.amount) === totalAmount`) before ever
 * persisting it.
 */
export function buildInstallmentSchedule(input: {
  tiOutstanding: number;
  localOutstanding: number;
  installmentCount: number;
  firstDueOn: Date;
}): { schedule: InstallmentScheduleEntry[]; totalAmount: number } {
  const schedule: InstallmentScheduleEntry[] = [];
  let seq = 1;
  if (input.tiOutstanding > 0) {
    schedule.push({
      seq: seq++,
      dueOn: toDateOnly(new Date()),
      amount: input.tiOutstanding,
      paidAt: null,
      ledgerEntryId: null,
    });
  }
  for (const amount of splitEvenly(input.localOutstanding, input.installmentCount)) {
    schedule.push({
      seq: seq++,
      dueOn: toDateOnly(
        addMonths(input.firstDueOn, schedule.length - (input.tiOutstanding > 0 ? 1 : 0)),
      ),
      amount,
      paidAt: null,
      ledgerEntryId: null,
    });
  }
  const totalAmount = Math.round(schedule.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
  return { schedule, totalAmount };
}

@Injectable()
export class InstallmentPlanService {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly duesRecords: DuesRecordRepository,
    private readonly ledgerEntries: LedgerEntryRepository,
  ) {}

  list(orgUnitId: string): Promise<InstallmentPlan[]> {
    return this.plans.findByClub(orgUnitId);
  }

  findById(id: string): Promise<InstallmentPlan | null> {
    return this.plans.findById(id);
  }

  async create(
    orgUnitId: string,
    input: CreateInstallmentPlanRequest & { approvedBy: string },
  ): Promise<InstallmentPlan> {
    const record = await this.duesRecords.findById(input.duesRecordId);
    if (!record || record.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Dues record not found');
    }
    const existing = await this.plans.findActiveByDuesRecord(input.duesRecordId);
    if (existing) {
      throw new ConflictException('This dues record already has an active installment plan');
    }

    const tiOutstanding = record.tiAmountDue - record.tiAmountPaid;
    const localOutstanding = record.localAmountDue - record.localAmountPaid;
    if (localOutstanding <= 0) {
      throw new BadRequestException('No outstanding local dues to build a plan against');
    }

    const { schedule, totalAmount } = buildInstallmentSchedule({
      tiOutstanding: Math.max(tiOutstanding, 0),
      localOutstanding,
      installmentCount: input.installmentCount,
      firstDueOn: new Date(input.firstDueOn),
    });

    return this.plans.create({
      orgUnitId,
      duesRecordId: record.id,
      personId: record.personId,
      totalAmount,
      currency: record.localCurrency,
      schedule,
      approvedBy: input.approvedBy,
      notes: input.notes,
    });
  }

  async recordPayment(input: {
    orgUnitId: string;
    planId: string;
    seq: number;
    ledgerEntryId: string;
  }): Promise<InstallmentPlan> {
    const plan = await this.plans.findById(input.planId);
    if (!plan || plan.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Installment plan not found');
    }
    if (plan.status !== 'active') {
      throw new ConflictException(`Cannot record a payment on a ${plan.status} plan`);
    }
    const entryIndex = plan.schedule.findIndex((s) => s.seq === input.seq);
    if (entryIndex === -1) {
      throw new BadRequestException(`No schedule entry with seq ${input.seq}`);
    }
    if (plan.schedule[entryIndex]!.paidAt) {
      throw new ConflictException('This installment is already marked paid');
    }
    const ledgerEntry = await this.ledgerEntries.findById(input.ledgerEntryId);
    if (!ledgerEntry || ledgerEntry.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Ledger entry not found for this club');
    }

    const schedule = plan.schedule.map((entry, i) =>
      i === entryIndex
        ? { ...entry, paidAt: new Date().toISOString(), ledgerEntryId: input.ledgerEntryId }
        : entry,
    );
    const allPaid = schedule.every((entry) => entry.paidAt !== null);
    return this.plans.updateScheduleAndStatus(input.planId, {
      schedule,
      status: allPaid ? 'completed' : 'active',
    });
  }

  async cancel(orgUnitId: string, planId: string, reason: string): Promise<InstallmentPlan> {
    const plan = await this.plans.findById(planId);
    if (!plan || plan.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Installment plan not found');
    }
    if (plan.status !== 'active') {
      throw new ConflictException(`Cannot cancel a ${plan.status} plan`);
    }
    const notes = [plan.notes, `Cancelled: ${reason}`].filter(Boolean).join(' | ');
    return this.plans.cancel(planId, notes);
  }
}
