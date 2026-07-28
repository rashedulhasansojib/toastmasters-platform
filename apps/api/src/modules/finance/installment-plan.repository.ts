import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  InstallmentPlan,
  InstallmentPlanStatus,
  InstallmentScheduleEntry,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type InstallmentPlanRow = Awaited<ReturnType<PrismaClient['installmentPlan']['create']>>;

function toInstallmentPlan(row: InstallmentPlanRow): InstallmentPlan {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    duesRecordId: row.duesRecordId,
    personId: row.personId,
    totalAmount: row.totalAmount.toNumber(),
    currency: row.currency,
    schedule: row.schedule as InstallmentScheduleEntry[],
    status: row.status,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
    notes: row.notes,
  };
}

@Injectable()
export class InstallmentPlanRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    duesRecordId: string;
    personId: string;
    totalAmount: number;
    currency: string;
    schedule: InstallmentScheduleEntry[];
    approvedBy: string;
    notes?: string;
  }): Promise<InstallmentPlan> {
    const row = await this.db.installmentPlan.create({ data: input });
    return toInstallmentPlan(row);
  }

  async findByClub(orgUnitId: string): Promise<InstallmentPlan[]> {
    const rows = await this.db.installmentPlan.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toInstallmentPlan);
  }

  async findById(id: string): Promise<InstallmentPlan | null> {
    const row = await this.db.installmentPlan.findUnique({ where: { id } });
    return row ? toInstallmentPlan(row) : null;
  }

  async findActiveByDuesRecord(duesRecordId: string): Promise<InstallmentPlan | null> {
    const row = await this.db.installmentPlan.findFirst({
      where: { duesRecordId, status: 'active' },
    });
    return row ? toInstallmentPlan(row) : null;
  }

  async updateScheduleAndStatus(
    id: string,
    input: { schedule: InstallmentScheduleEntry[]; status: InstallmentPlanStatus },
  ): Promise<InstallmentPlan> {
    const row = await this.db.installmentPlan.update({
      where: { id },
      data: { schedule: input.schedule, status: input.status },
    });
    return toInstallmentPlan(row);
  }

  async cancel(id: string, notes: string): Promise<InstallmentPlan> {
    const row = await this.db.installmentPlan.update({
      where: { id },
      data: { status: 'cancelled', notes },
    });
    return toInstallmentPlan(row);
  }
}
