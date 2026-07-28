import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ClubDuesSettings } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

/** Reads/writes only the three dues-rate columns on `org_unit` — not the full `OrgUnitRepository`'s ltree-aware surface, which this doesn't need. */
@Injectable()
export class ClubDuesSettingsRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async find(orgUnitId: string): Promise<ClubDuesSettings> {
    const row = await this.db.orgUnit.findUniqueOrThrow({
      where: { id: orgUnitId },
      select: { id: true, localDuesAmount: true, tiDuesAmount: true, duesCurrency: true },
    });
    return {
      orgUnitId: row.id,
      localDuesAmount: row.localDuesAmount?.toNumber() ?? null,
      tiDuesAmount: row.tiDuesAmount?.toNumber() ?? null,
      currency: row.duesCurrency,
    };
  }

  async update(
    orgUnitId: string,
    patch: { localDuesAmount?: number; tiDuesAmount?: number; currency?: string },
  ): Promise<ClubDuesSettings> {
    const row = await this.db.orgUnit.update({
      where: { id: orgUnitId },
      data: {
        localDuesAmount: patch.localDuesAmount,
        tiDuesAmount: patch.tiDuesAmount,
        duesCurrency: patch.currency,
      },
      select: { id: true, localDuesAmount: true, tiDuesAmount: true, duesCurrency: true },
    });
    return {
      orgUnitId: row.id,
      localDuesAmount: row.localDuesAmount?.toNumber() ?? null,
      tiDuesAmount: row.tiDuesAmount?.toNumber() ?? null,
      currency: row.duesCurrency,
    };
  }
}
