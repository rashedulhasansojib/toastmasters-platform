import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ProgramYear } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ProgramYearRow = Awaited<ReturnType<PrismaClient['programYear']['create']>>;

function toProgramYear(row: ProgramYearRow): ProgramYear {
  return {
    id: row.id,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    status: row.status,
  };
}

@Injectable()
export class ProgramYearRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: { id: string; startsOn: Date; endsOn: Date }): Promise<ProgramYear> {
    const row = await this.db.programYear.create({
      data: { id: input.id, startsOn: input.startsOn, endsOn: input.endsOn },
    });
    return toProgramYear(row);
  }

  async findById(id: string): Promise<ProgramYear | null> {
    const row = await this.db.programYear.findUnique({ where: { id } });
    return row ? toProgramYear(row) : null;
  }

  /** Session claims resolve `programYearId` from whichever year is currently open. */
  async findCurrent(): Promise<ProgramYear | null> {
    const row = await this.db.programYear.findFirst({ where: { status: 'current' } });
    return row ? toProgramYear(row) : null;
  }
}
