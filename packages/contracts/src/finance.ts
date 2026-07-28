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

/**
 * M4 Slice 6: system-design.md §12.1. One record per (membership, period) —
 * CLAUDE.md §2 decision 7 (flat semiannual local dues). `status` is derived
 * by an explicit handler on payment, not a stored flag anyone can set
 * directly (`FR-FIN-3`) — there is deliberately no `updateStatus` request
 * schema. Scope cut: `lapsed` is not yet reachable — see the schema comment
 * on `DuesRecordStatus`.
 */
export const duesRecordStatus = z.enum(['due', 'partial', 'paid', 'waived', 'lapsed']);
export type DuesRecordStatus = z.infer<typeof duesRecordStatus>;

export const duesRecord = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  clubMembershipId: z.uuid(),
  personId: z.uuid(),
  duesPeriod: z.string(),
  programYearId: z.string(),
  tiAmountDue: z.number(),
  tiAmountPaid: z.number(),
  tiCurrency: z.string(),
  tiPaidAt: z.iso.datetime().nullable(),
  tiSubmittedToWhqAt: z.iso.datetime().nullable(),
  localAmountDue: z.number(),
  localAmountPaid: z.number(),
  localCurrency: z.string(),
  localPaidAt: z.iso.datetime().nullable(),
  status: duesRecordStatus,
  ledgerEntryIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});
export type DuesRecord = z.infer<typeof duesRecord>;

/** Generates one DuesRecord per active club membership without one yet for this period — amounts come from the club's configured dues settings, never client-supplied. */
export const generateDuesRecordsRequestSchema = z
  .object({
    duesPeriod: z.string().min(1),
    programYearId: z.string().min(1),
  })
  .strict();
export type GenerateDuesRecordsRequest = z.infer<typeof generateDuesRecordsRequestSchema>;

export const recordDuesPaymentRequestSchema = z
  .object({
    scope: z.enum(['ti', 'local']),
    amount: z.number().positive(),
    ledgerEntryId: z.uuid(),
  })
  .strict();
export type RecordDuesPaymentRequest = z.infer<typeof recordDuesPaymentRequestSchema>;

/** club-level flat dues rates (CLAUDE.md §2 decision 7) — set by the Treasurer, read at DuesRecord-generation time. */
export const updateClubDuesSettingsRequestSchema = z
  .object({
    localDuesAmount: z.number().nonnegative().optional(),
    tiDuesAmount: z.number().nonnegative().optional(),
    currency: z.string().min(1).optional(),
  })
  .strict();
export type UpdateClubDuesSettingsRequest = z.infer<typeof updateClubDuesSettingsRequestSchema>;

export const clubDuesSettings = z.object({
  orgUnitId: z.uuid(),
  localDuesAmount: z.number().nullable(),
  tiDuesAmount: z.number().nullable(),
  currency: z.string().nullable(),
});
export type ClubDuesSettings = z.infer<typeof clubDuesSettings>;
