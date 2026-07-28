import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createInvoiceRequestSchema,
  recordInvoicePaymentRequestSchema,
  voidInvoiceRequestSchema,
  creditNoteInvoiceRequestSchema,
  type CreateInvoiceRequest,
  type RecordInvoicePaymentRequest,
  type VoidInvoiceRequest,
  type CreditNoteInvoiceRequest,
  type Invoice,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { InvoiceService } from './invoice.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 7: system-design.md §12.2. `finance.invoice` is `restricted`, same bracket as `finance.ledger`/`finance.dues`. */
@Controller('clubs/:clubUnitId/invoices')
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @Post()
  @ResourceScope('finance.invoice', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createInvoiceRequestSchema)) body: CreateInvoiceRequest,
  ): Promise<Invoice> {
    return this.invoices.create(clubUnitId, body);
  }

  @Get()
  @ResourceScope('finance.invoice', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<Invoice[]> {
    return this.invoices.list(clubUnitId);
  }

  @Get(':invoiceId')
  @ResourceScope('finance.invoice', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('invoiceId', uuidPipe) invoiceId: string,
  ): Promise<Invoice> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice || invoice.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  @Post(':invoiceId/payments')
  @ResourceScope('finance.invoice', 'update', { source: 'param', key: 'clubUnitId' })
  recordPayment(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('invoiceId', uuidPipe) invoiceId: string,
    @Body(new ZodValidationPipe(recordInvoicePaymentRequestSchema))
    body: RecordInvoicePaymentRequest,
  ): Promise<Invoice> {
    return this.invoices.recordPayment({
      orgUnitId: clubUnitId,
      invoiceId,
      ledgerEntryId: body.ledgerEntryId,
      amount: body.amount,
    });
  }

  /** Only legal before any payment is recorded — once money has moved, correct with a credit note instead. */
  @Post(':invoiceId/void')
  @ResourceScope('finance.invoice', 'update', { source: 'param', key: 'clubUnitId' })
  voidInvoice(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('invoiceId', uuidPipe) invoiceId: string,
    @Body(new ZodValidationPipe(voidInvoiceRequestSchema)) body: VoidInvoiceRequest,
  ): Promise<Invoice> {
    return this.invoices.void(clubUnitId, invoiceId, body.reason);
  }

  @Post(':invoiceId/credit-note')
  @ResourceScope('finance.invoice', 'create', { source: 'param', key: 'clubUnitId' })
  creditNote(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('invoiceId', uuidPipe) invoiceId: string,
    @Body(new ZodValidationPipe(creditNoteInvoiceRequestSchema)) body: CreditNoteInvoiceRequest,
  ): Promise<Invoice> {
    return this.invoices.creditNote(clubUnitId, invoiceId, body.reason);
  }
}
