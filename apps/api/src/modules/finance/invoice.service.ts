import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { CreateInvoiceRequest, Invoice, InvoiceLine } from '@toastmasters/contracts';
import { DuesRecordRepository } from './dues-record.repository';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { InvoiceRepository } from './invoice.repository';

/** M4 Slice 7: system-design.md §12.2. Invoices are generated FROM `DuesRecord`s — never an ad hoc line-item entry surface — so reconciliation stays automatic. */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly duesRecords: DuesRecordRepository,
    private readonly ledgerEntries: LedgerEntryRepository,
  ) {}

  list(orgUnitId: string): Promise<Invoice[]> {
    return this.invoices.findByClub(orgUnitId);
  }

  findById(id: string): Promise<Invoice | null> {
    return this.invoices.findById(id);
  }

  async create(orgUnitId: string, input: CreateInvoiceRequest): Promise<Invoice> {
    const lines: InvoiceLine[] = [];
    let currency: string | null = null;
    for (const duesRecordId of input.duesRecordIds) {
      const record = await this.duesRecords.findById(duesRecordId);
      if (!record || record.orgUnitId !== orgUnitId) {
        throw new BadRequestException(`Dues record ${duesRecordId} not found`);
      }
      const outstanding =
        record.tiAmountDue - record.tiAmountPaid + (record.localAmountDue - record.localAmountPaid);
      if (outstanding <= 0) {
        throw new BadRequestException(
          `Dues record ${duesRecordId} has nothing outstanding to bill`,
        );
      }
      currency ??= record.tiCurrency;
      lines.push({
        description: `Dues — ${record.duesPeriod}`,
        quantity: 1,
        unitAmount: outstanding,
        amount: outstanding,
        duesRecordId: record.id,
      });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    return this.invoices.createWithNextNumber({
      orgUnitId,
      programYearId: input.programYearId,
      issuedToKind: input.issuedToKind,
      issuedToRef: input.issuedToRef,
      issuedToName: input.issuedToName,
      issuedToEmail: input.issuedToEmail,
      dueOn: new Date(input.dueOn),
      lines,
      subtotal,
      total: subtotal,
      currency: currency!,
    });
  }

  async recordPayment(input: {
    orgUnitId: string;
    invoiceId: string;
    ledgerEntryId: string;
    amount: number;
  }): Promise<Invoice> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice || invoice.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Invoice not found');
    }
    if (invoice.status === 'void') {
      throw new ConflictException('Cannot record a payment against a voided invoice');
    }
    const ledgerEntry = await this.ledgerEntries.findById(input.ledgerEntryId);
    if (!ledgerEntry || ledgerEntry.orgUnitId !== input.orgUnitId) {
      throw new BadRequestException('Ledger entry not found for this club');
    }
    if (invoice.payments.some((p) => p.ledgerEntryId === input.ledgerEntryId)) {
      throw new ConflictException('This ledger entry is already linked to this invoice');
    }

    const payments = [
      ...invoice.payments,
      { ledgerEntryId: input.ledgerEntryId, amount: input.amount, at: new Date().toISOString() },
    ];
    const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    const status = paidTotal >= invoice.total ? 'paid' : 'partially_paid';
    return this.invoices.recordPayment(input.invoiceId, { payments, status });
  }

  async void(orgUnitId: string, invoiceId: string, reason: string): Promise<Invoice> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice || invoice.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Invoice not found');
    }
    if (invoice.status === 'void') {
      throw new ConflictException('Invoice is already void');
    }
    if (invoice.payments.length > 0) {
      throw new ConflictException(
        'Cannot void an invoice with recorded payments — issue a credit note instead',
      );
    }
    return this.invoices.void(invoiceId, reason);
  }

  /** A negative-total invoice referencing the original — the correction mechanism for an already-issued invoice, which is never edited in place. */
  async creditNote(orgUnitId: string, invoiceId: string, reason: string): Promise<Invoice> {
    const original = await this.invoices.findById(invoiceId);
    if (!original || original.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Invoice not found');
    }
    if (original.creditNoteForInvoiceId) {
      throw new BadRequestException('Cannot issue a credit note against a credit note');
    }

    const lines: InvoiceLine[] = original.lines.map((line) => ({
      ...line,
      unitAmount: -line.unitAmount,
      amount: -line.amount,
      description: `Credit note (${reason}): ${line.description}`,
    }));
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    return this.invoices.createWithNextNumber({
      orgUnitId,
      programYearId: original.programYearId,
      issuedToKind: original.issuedToKind,
      issuedToRef: original.issuedToRef ?? undefined,
      issuedToName: original.issuedToName,
      issuedToEmail: original.issuedToEmail ?? undefined,
      dueOn: new Date(),
      lines,
      subtotal,
      total: subtotal,
      currency: original.currency,
      creditNoteForInvoiceId: original.id,
    });
  }
}
