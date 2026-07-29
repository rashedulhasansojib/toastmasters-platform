import { z } from 'zod';

/**
 * M5 Slice 3: system-design.md §14.2. `quantity` is derived from the
 * append-only movement log, not stored (`FR-OPS-2`) — same principle as the
 * ledger. `custodianPersonId` is what makes the 1 July handover work.
 */
export const inventoryItemCategory = z.enum([
  'banner',
  'trophy',
  'timer_device',
  'stationery',
  'equipment',
  'book',
  'signage',
  'other',
]);
export type InventoryItemCategory = z.infer<typeof inventoryItemCategory>;

export const inventoryItemCondition = z.enum(['new', 'good', 'worn', 'damaged', 'lost']);
export type InventoryItemCondition = z.infer<typeof inventoryItemCondition>;

export const inventoryItem = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  name: z.string(),
  category: inventoryItemCategory,
  unit: z.string(),
  condition: inventoryItemCondition,
  location: z.string().nullable(),
  custodianPersonId: z.uuid().nullable(),
  acquiredOn: z.iso.date().nullable(),
  acquisitionLedgerEntryId: z.uuid().nullable(),
  replacementCost: z.number().nullable(),
  lastAuditedAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
  quantity: z.number().int(), // derived — never persisted directly, never client-supplied
});
export type InventoryItem = z.infer<typeof inventoryItem>;

export const inventoryMovementType = z.enum([
  'acquire',
  'checkout',
  'return',
  'dispose',
  'adjust',
  'audit',
]);
export type InventoryMovementType = z.infer<typeof inventoryMovementType>;

export const inventoryMovement = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  orgUnitId: z.uuid(),
  type: inventoryMovementType,
  quantity: z.number().int(),
  byPersonId: z.uuid(),
  meetingId: z.uuid().nullable(),
  at: z.iso.datetime(),
  note: z.string().nullable(),
});
export type InventoryMovement = z.infer<typeof inventoryMovement>;

export const createInventoryItemRequestSchema = z
  .object({
    name: z.string().min(1),
    category: inventoryItemCategory,
    unit: z.string().min(1),
    condition: inventoryItemCondition.default('new'),
    location: z.string().min(1).optional(),
    custodianPersonId: z.uuid().optional(),
    acquiredOn: z.iso.date().optional(),
    acquisitionLedgerEntryId: z.uuid().optional(),
    replacementCost: z.number().positive().optional(),
    notes: z.string().min(1).optional(),
    openingQuantity: z.number().int().nonnegative().default(0),
  })
  .strict();
export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemRequestSchema>;

export const updateInventoryItemRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    condition: inventoryItemCondition.optional(),
    location: z.string().min(1).optional(),
    replacementCost: z.number().positive().optional(),
    notes: z.string().min(1).optional(),
    lastAuditedAt: z.iso.datetime().optional(),
  })
  .strict();
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemRequestSchema>;

/** `checkout` moves custody to `byPersonId` (recorded on the item) without changing quantity; `return` moves it back. Quantity-affecting types (`acquire`/`dispose`/`adjust`) carry a signed `quantity`. */
export const createInventoryMovementRequestSchema = z
  .object({
    type: inventoryMovementType,
    quantity: z.number().int(),
    meetingId: z.uuid().optional(),
    note: z.string().min(1).optional(),
  })
  .strict();
export type CreateInventoryMovementRequest = z.infer<typeof createInventoryMovementRequestSchema>;
