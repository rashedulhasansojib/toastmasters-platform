import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateInventoryItemRequest,
  CreateInventoryMovementRequest,
  InventoryItem,
  InventoryMovement,
} from '@toastmasters/contracts';
import { InventoryItemRepository } from './inventory-item.repository';
import { InventoryMovementRepository } from './inventory-movement.repository';

/**
 * M5 Slice 3: system-design.md §14.2. `InventoryItem.quantity` is derived
 * from the movement log, never stored (`FR-OPS-2`) — this service is where
 * the movement type is mapped to its effect on quantity/custody, so the
 * repository stays a dumb append-only insert (I-7, same shape as the
 * ledger).
 */
@Injectable()
export class InventoryItemService {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly movements: InventoryMovementRepository,
  ) {}

  async create(
    orgUnitId: string,
    recordedBy: string,
    body: CreateInventoryItemRequest,
  ): Promise<InventoryItem> {
    const item = await this.items.create({
      orgUnitId,
      name: body.name,
      category: body.category,
      unit: body.unit,
      condition: body.condition,
      location: body.location,
      custodianPersonId: body.custodianPersonId,
      acquiredOn: body.acquiredOn ? new Date(body.acquiredOn) : undefined,
      acquisitionLedgerEntryId: body.acquisitionLedgerEntryId,
      replacementCost: body.replacementCost,
      notes: body.notes,
    });
    if (body.openingQuantity > 0) {
      await this.movements.create({
        itemId: item.id,
        orgUnitId,
        type: 'acquire',
        quantity: body.openingQuantity,
        byPersonId: recordedBy,
        note: 'Opening quantity',
      });
    }
    return { ...item, quantity: body.openingQuantity };
  }

  list(orgUnitId: string): Promise<InventoryItem[]> {
    return this.items.findByOrgUnit(orgUnitId);
  }

  update(
    id: string,
    body: Partial<{
      name: string;
      condition: InventoryItem['condition'];
      location: string;
      replacementCost: number;
      notes: string;
      lastAuditedAt: string;
    }>,
  ): Promise<InventoryItem> {
    return this.items.update(id, {
      ...body,
      lastAuditedAt: body.lastAuditedAt ? new Date(body.lastAuditedAt) : undefined,
    });
  }

  listMovements(itemId: string): Promise<InventoryMovement[]> {
    return this.movements.findByItem(itemId);
  }

  /**
   * `checkout`/`return` are custody moves — quantity-neutral (stored `0`),
   * they only update `custodianPersonId`. `acquire` adds, `dispose`
   * subtracts (client sends an unsigned magnitude; the sign is applied
   * here, never trusted from the request). `adjust` is a signed correction.
   * `audit` is informational only — records `lastAuditedAt`, no quantity
   * effect (a discrepancy found during audit is corrected via a follow-up
   * `adjust`, not folded into the audit row itself).
   */
  async recordMovement(
    orgUnitId: string,
    itemId: string,
    byPersonId: string,
    body: CreateInventoryMovementRequest,
  ): Promise<InventoryMovement> {
    const item = await this.items.findById(itemId);
    if (!item || item.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Inventory item not found');
    }

    let storedQuantity: number;
    switch (body.type) {
      case 'acquire':
        if (body.quantity <= 0)
          throw new BadRequestException('acquire requires a positive quantity');
        storedQuantity = body.quantity;
        break;
      case 'dispose':
        if (body.quantity <= 0)
          throw new BadRequestException('dispose requires a positive quantity');
        storedQuantity = -body.quantity;
        break;
      case 'adjust':
        if (body.quantity === 0)
          throw new BadRequestException('adjust requires a non-zero quantity');
        storedQuantity = body.quantity;
        break;
      case 'checkout':
      case 'return':
      case 'audit':
        storedQuantity = 0;
        break;
    }

    const movement = await this.movements.create({
      itemId,
      orgUnitId,
      type: body.type,
      quantity: storedQuantity,
      byPersonId,
      meetingId: body.meetingId,
      note: body.note,
    });

    if (body.type === 'checkout') {
      await this.items.update(itemId, { custodianPersonId: byPersonId });
    } else if (body.type === 'return') {
      await this.items.update(itemId, { custodianPersonId: null });
    } else if (body.type === 'audit') {
      await this.items.update(itemId, { lastAuditedAt: new Date() });
    }

    return movement;
  }

  async findById(id: string): Promise<InventoryItem> {
    const item = await this.items.findById(id);
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }
}
