import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

/**
 * The console's own two counts. The org tree itself comes from
 * OrgUnitRepository.findSubtree — this module does not re-implement a query
 * the org context already owns.
 */
@Injectable()
export class PlatformConsoleRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async countActivePeople(): Promise<number> {
    return this.db.person.count({ where: { status: 'active' } });
  }

  async currentProgramYearId(): Promise<string | null> {
    const year = await this.db.programYear.findFirst({
      where: { status: 'current' },
      select: { id: true },
    });
    return year?.id ?? null;
  }
}
