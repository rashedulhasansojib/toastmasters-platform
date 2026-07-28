import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  Invoice,
  InvoiceIssuedToKind,
  InvoiceLine,
  InvoicePayment,
  InvoiceStatus,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type InvoiceRow = Awaited<ReturnType<PrismaClient['invoice']['create']>>;

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    invoiceNumber: row.invoiceNumber,
    issuedToKind: row.issuedToKind,
    issuedToRef: row.issuedToRef,
    issuedToName: row.issuedToName,
    issuedToEmail: row.issuedToEmail,
    issuedOn: row.issuedOn.toISOString().slice(0, 10),
    dueOn: row.dueOn.toISOString().slice(0, 10),
    lines: row.lines as InvoiceLine[],
    subtotal: row.subtotal.toNumber(),
    total: row.total.toNumber(),
    currency: row.currency,
    status: row.status,
    payments: row.payments as InvoicePayment[],
    pdfUrl: row.pdfUrl,
    sentAt: row.sentAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    creditNoteForInvoiceId: row.creditNoteForInvoiceId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class InvoiceRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /**
   * system-design.md §19.3 I-13: gapless per (club, program year). The
   * `FOR UPDATE` row lock inside this transaction serialises concurrent
   * callers on the same (orgUnitId, programYearId) — the second transaction
   * blocks on the lock until the first commits its increment, so two
   * concurrent invoices can never claim the same number and no number is
   * ever skipped by a failed/rolled-back attempt claiming one and dying.
   */
  async createWithNextNumber(input: {
    orgUnitId: string;
    programYearId: string;
    issuedToKind: InvoiceIssuedToKind;
    issuedToRef?: string;
    issuedToName: string;
    issuedToEmail?: string;
    dueOn: Date;
    lines: InvoiceLine[];
    subtotal: number;
    total: number;
    currency: string;
    creditNoteForInvoiceId?: string;
  }): Promise<Invoice> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO invoice_sequence (org_unit_id, program_year_id, next_number)
        VALUES (${input.orgUnitId}::uuid, ${input.programYearId}, 1)
        ON CONFLICT (org_unit_id, program_year_id) DO NOTHING
      `;
      const locked = await tx.$queryRaw<Array<{ next_number: number }>>`
        SELECT next_number FROM invoice_sequence
        WHERE org_unit_id = ${input.orgUnitId}::uuid AND program_year_id = ${input.programYearId}
        FOR UPDATE
      `;
      const number = locked[0]!.next_number;
      await tx.$executeRaw`
        UPDATE invoice_sequence SET next_number = next_number + 1
        WHERE org_unit_id = ${input.orgUnitId}::uuid AND program_year_id = ${input.programYearId}
      `;

      const row = await tx.invoice.create({
        data: {
          orgUnitId: input.orgUnitId,
          programYearId: input.programYearId,
          invoiceNumber: String(number).padStart(5, '0'),
          issuedToKind: input.issuedToKind,
          issuedToRef: input.issuedToRef,
          issuedToName: input.issuedToName,
          issuedToEmail: input.issuedToEmail,
          dueOn: input.dueOn,
          lines: input.lines,
          subtotal: input.subtotal,
          total: input.total,
          currency: input.currency,
          creditNoteForInvoiceId: input.creditNoteForInvoiceId,
        },
      });
      return toInvoice(row);
    });
  }

  async findByClub(orgUnitId: string): Promise<Invoice[]> {
    const rows = await this.db.invoice.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toInvoice);
  }

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.db.invoice.findUnique({ where: { id } });
    return row ? toInvoice(row) : null;
  }

  async recordPayment(
    id: string,
    input: { payments: InvoicePayment[]; status: InvoiceStatus },
  ): Promise<Invoice> {
    const row = await this.db.invoice.update({
      where: { id },
      data: { payments: input.payments, status: input.status },
    });
    return toInvoice(row);
  }

  async void(id: string, reason: string): Promise<Invoice> {
    const row = await this.db.invoice.update({
      where: { id },
      data: { status: 'void', voidReason: reason },
    });
    return toInvoice(row);
  }
}
