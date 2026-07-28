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

/**
 * M4 Slice 7: system-design.md §12.2/§19.3 I-13 — invoice numbers are
 * gapless per (club, program year) via a sequence table + row lock. Never
 * edited after issue; corrections are a credit note (a new, negative-total
 * invoice referencing this one), never a mutation of `lines`/`total`.
 */
export const invoiceIssuedToKind = z.enum(['member', 'prospect', 'external']);
export type InvoiceIssuedToKind = z.infer<typeof invoiceIssuedToKind>;

export const invoiceStatus = z.enum(['draft', 'issued', 'partially_paid', 'paid', 'void']);
export type InvoiceStatus = z.infer<typeof invoiceStatus>;

export const invoiceLine = z.object({
  description: z.string(),
  quantity: z.number(),
  unitAmount: z.number(),
  amount: z.number(),
  duesRecordId: z.uuid().nullable(),
});
export type InvoiceLine = z.infer<typeof invoiceLine>;

export const invoicePayment = z.object({
  ledgerEntryId: z.uuid(),
  amount: z.number(),
  at: z.iso.datetime(),
});
export type InvoicePayment = z.infer<typeof invoicePayment>;

export const invoice = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  programYearId: z.string(),
  invoiceNumber: z.string(),
  issuedToKind: invoiceIssuedToKind,
  issuedToRef: z.uuid().nullable(),
  issuedToName: z.string(),
  issuedToEmail: z.string().nullable(),
  issuedOn: z.iso.date(),
  dueOn: z.iso.date(),
  lines: z.array(invoiceLine),
  subtotal: z.number(),
  total: z.number(),
  currency: z.string(),
  status: invoiceStatus,
  payments: z.array(invoicePayment),
  pdfUrl: z.string().nullable(),
  sentAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  creditNoteForInvoiceId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type Invoice = z.infer<typeof invoice>;

/** Generated FROM one or more DuesRecords — this is not an ad hoc line-item entry surface (system-design.md §12.2: "line items link to DuesRecord"). */
export const createInvoiceRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    duesRecordIds: z.array(z.uuid()).min(1),
    issuedToKind: invoiceIssuedToKind,
    issuedToRef: z.uuid().optional(),
    issuedToName: z.string().min(1),
    issuedToEmail: z.email().optional(),
    dueOn: z.iso.date(),
  })
  .strict();
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

export const recordInvoicePaymentRequestSchema = z
  .object({
    ledgerEntryId: z.uuid(),
    amount: z.number().positive(),
  })
  .strict();
export type RecordInvoicePaymentRequest = z.infer<typeof recordInvoicePaymentRequestSchema>;

export const voidInvoiceRequestSchema = z.object({ reason: z.string().min(1) }).strict();
export type VoidInvoiceRequest = z.infer<typeof voidInvoiceRequestSchema>;

export const creditNoteInvoiceRequestSchema = z.object({ reason: z.string().min(1) }).strict();
export type CreditNoteInvoiceRequest = z.infer<typeof creditNoteInvoiceRequestSchema>;

/**
 * M4 Slice 8: system-design.md §12.3 / CLAUDE.md §2 decision 8 — installment
 * plans are permitted, Treasurer approves alone (`approvedBy` is satisfied
 * by the caller holding `finance.installment_plan:create`, no co-approval
 * step). `SUM(schedule.amount) = totalAmount` (I-14) is asserted in the
 * service that builds the schedule, not client-constructible — there is no
 * request schema for `schedule` itself.
 */
export const installmentPlanStatus = z.enum(['active', 'completed', 'defaulted', 'cancelled']);
export type InstallmentPlanStatus = z.infer<typeof installmentPlanStatus>;

export const installmentScheduleEntry = z.object({
  seq: z.number().int().positive(),
  dueOn: z.iso.date(),
  amount: z.number(),
  paidAt: z.iso.datetime().nullable(),
  ledgerEntryId: z.uuid().nullable(),
});
export type InstallmentScheduleEntry = z.infer<typeof installmentScheduleEntry>;

export const installmentPlan = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  duesRecordId: z.uuid(),
  personId: z.uuid(),
  totalAmount: z.number(),
  currency: z.string(),
  schedule: z.array(installmentScheduleEntry),
  status: installmentPlanStatus,
  approvedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  notes: z.string().nullable(),
});
export type InstallmentPlan = z.infer<typeof installmentPlan>;

export const createInstallmentPlanRequestSchema = z
  .object({
    duesRecordId: z.uuid(),
    installmentCount: z.number().int().min(2).max(12),
    firstDueOn: z.iso.date(),
    notes: z.string().min(1).optional(),
  })
  .strict();
export type CreateInstallmentPlanRequest = z.infer<typeof createInstallmentPlanRequestSchema>;

export const recordInstallmentPaymentRequestSchema = z
  .object({
    ledgerEntryId: z.uuid(),
  })
  .strict();
export type RecordInstallmentPaymentRequest = z.infer<typeof recordInstallmentPaymentRequestSchema>;

export const cancelInstallmentPlanRequestSchema = z.object({ reason: z.string().min(1) }).strict();
export type CancelInstallmentPlanRequest = z.infer<typeof cancelInstallmentPlanRequestSchema>;
