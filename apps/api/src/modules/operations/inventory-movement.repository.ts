import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { InventoryMovement, InventoryMovementType } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type InventoryMovementRow = Awaited<ReturnType<PrismaClient['inventoryMovement']['create']>>;

function toInventoryMovement(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    itemId: row.itemId,
    orgUnitId: row.orgUnitId,
    type: row.type,
    quantity: row.quantity,
    byPersonId: row.byPersonId,
    meetingId: row.meetingId,
    at: row.at.toISOString(),
    note: row.note,
  };
}

/** Append-only — `REVOKE UPDATE, DELETE` in the migration (I-7). This repository only ever inserts. */
@Injectable()
export class InventoryMovementRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    itemId: string;
    orgUnitId: string;
    type: InventoryMovementType;
    quantity: number;
    byPersonId: string;
    meetingId?: string;
    note?: string;
  }): Promise<InventoryMovement> {
    const row = await this.db.inventoryMovement.create({ data: input });
    return toInventoryMovement(row);
  }

  async findByItem(itemId: string): Promise<InventoryMovement[]> {
    const rows = await this.db.inventoryMovement.findMany({
      where: { itemId },
      orderBy: { at: 'desc' },
    });
    return rows.map(toInventoryMovement);
  }
}
