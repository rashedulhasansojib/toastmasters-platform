import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  InventoryItem,
  InventoryItemCategory,
  InventoryItemCondition,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type InventoryItemRow = Awaited<ReturnType<PrismaClient['inventoryItem']['create']>>;

function toInventoryItem(row: InventoryItemRow, quantity: number): InventoryItem {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    name: row.name,
    category: row.category,
    unit: row.unit,
    condition: row.condition,
    location: row.location,
    custodianPersonId: row.custodianPersonId,
    acquiredOn: row.acquiredOn ? row.acquiredOn.toISOString().slice(0, 10) : null,
    acquisitionLedgerEntryId: row.acquisitionLedgerEntryId,
    replacementCost: row.replacementCost ? row.replacementCost.toNumber() : null,
    lastAuditedAt: row.lastAuditedAt?.toISOString() ?? null,
    notes: row.notes,
    quantity,
  };
}

@Injectable()
export class InventoryItemRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    name: string;
    category: InventoryItemCategory;
    unit: string;
    condition: InventoryItemCondition;
    location?: string;
    custodianPersonId?: string;
    acquiredOn?: Date;
    acquisitionLedgerEntryId?: string;
    replacementCost?: number;
    notes?: string;
  }): Promise<InventoryItem> {
    const row = await this.db.inventoryItem.create({ data: input });
    return toInventoryItem(row, 0);
  }

  /** `quantity` is derived (I-15) — never a column. Signed sum over the movement log: `acquire`/`return`/`adjust` add (their `quantity` may be negative for a downward `adjust`), `checkout`/`dispose`/`audit` subtract or are quantity-neutral per the movement's own sign. */
  private async quantityFor(itemId: string): Promise<number> {
    const result = await this.db.inventoryMovement.aggregate({
      where: { itemId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async findById(id: string): Promise<InventoryItem | null> {
    const row = await this.db.inventoryItem.findUnique({ where: { id } });
    if (!row) return null;
    return toInventoryItem(row, await this.quantityFor(row.id));
  }

  async findByOrgUnit(orgUnitId: string): Promise<InventoryItem[]> {
    const rows = await this.db.inventoryItem.findMany({
      where: { orgUnitId },
      orderBy: { name: 'asc' },
    });
    const quantities = await this.db.inventoryMovement.groupBy({
      by: ['itemId'],
      where: { itemId: { in: rows.map((r) => r.id) } },
      _sum: { quantity: true },
    });
    const byItem = new Map(quantities.map((q) => [q.itemId, q._sum.quantity ?? 0]));
    return rows.map((row) => toInventoryItem(row, byItem.get(row.id) ?? 0));
  }

  async update(
    id: string,
    input: Partial<{
      name: string;
      condition: InventoryItemCondition;
      location: string;
      replacementCost: number;
      notes: string;
      lastAuditedAt: Date;
      custodianPersonId: string | null;
    }>,
  ): Promise<InventoryItem> {
    const row = await this.db.inventoryItem.update({ where: { id }, data: input });
    return toInventoryItem(row, await this.quantityFor(row.id));
  }
}
