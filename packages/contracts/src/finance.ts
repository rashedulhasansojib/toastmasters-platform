import { z } from 'zod';

/**
 * M4 Slice 5: system-design.md §12.1. Money is recorded, never processed
 * (`N4`) — this is a ledger of facts, not a payment rail. Append-only at the
 * DB layer; corrections are new reversing entries, never an edit.
 */
export const ledgerDirection = z.enum(['in', 'out']);
export type LedgerDirection = z.infer<typeof ledgerDirection>;

export const ledgerCounterpartyKind = z.enum(['member', 'prospect', 'vendor', 'district', 'other']);
export type LedgerCounterpartyKind = z.infer<typeof ledgerCounterpartyKind>;

export const ledgerEntry = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  programYearId: z.string(),
  direction: ledgerDirection,
  category: z.string(),
  amount: z.number(),
  currency: z.string(),
  occurredOn: z.iso.date(),
  counterpartyKind: ledgerCounterpartyKind,
  counterpartyRef: z.uuid().nullable(),
  counterpartyLabel: z.string(),
  description: z.string(),
  receiptUrl: z.string().nullable(),
  recordedBy: z.uuid(),
  recordedAt: z.iso.datetime(),
  reversalOfEntryId: z.uuid().nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

export const createLedgerEntryRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    direction: ledgerDirection,
    category: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().min(1),
    occurredOn: z.iso.date(),
    counterpartyKind: ledgerCounterpartyKind,
    counterpartyRef: z.uuid().optional(),
    counterpartyLabel: z.string().min(1),
    description: z.string().min(1),
    receiptUrl: z.string().min(1).optional(),
  })
  .strict();
export type CreateLedgerEntryRequest = z.infer<typeof createLedgerEntryRequestSchema>;

/** A reversal's direction/amount/currency/counterparty are copied from the original — only the reason is client-supplied. */
export const reverseLedgerEntryRequestSchema = z
  .object({
    reason: z.string().min(1),
  })
  .strict();
export type ReverseLedgerEntryRequest = z.infer<typeof reverseLedgerEntryRequestSchema>;
