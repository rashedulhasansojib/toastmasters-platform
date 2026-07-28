import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  generateDuesRecordsRequestSchema,
  recordDuesPaymentRequestSchema,
  type GenerateDuesRecordsRequest,
  type RecordDuesPaymentRequest,
  type DuesRecord,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { DuesRecordService } from './dues-record.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 6: system-design.md §12.1. `finance.dues` is `restricted` sensitivity, same bracket as `finance.ledger`. */
@Controller('clubs/:clubUnitId/dues-records')
export class DuesRecordController {
  constructor(private readonly duesRecords: DuesRecordService) {}

  @Post('generate')
  @ResourceScope('finance.dues', 'create', { source: 'param', key: 'clubUnitId' })
  generate(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(generateDuesRecordsRequestSchema))
    body: GenerateDuesRecordsRequest,
  ): Promise<DuesRecord[]> {
    return this.duesRecords.generate(clubUnitId, body);
  }

  @Get()
  @ResourceScope('finance.dues', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query('duesPeriod') duesPeriod?: string,
  ): Promise<DuesRecord[]> {
    return this.duesRecords.list(clubUnitId, duesPeriod);
  }

  @Get(':duesRecordId')
  @ResourceScope('finance.dues', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('duesRecordId', uuidPipe) duesRecordId: string,
  ): Promise<DuesRecord> {
    const record = await this.duesRecords.findById(duesRecordId);
    if (!record || record.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Dues record not found');
    }
    return record;
  }

  /** References an already-recorded `LedgerEntry` (Slice 5) — this endpoint never mints one, matching the design's `ledgerEntryIds` link rather than embed. */
  @Post(':duesRecordId/payments')
  @ResourceScope('finance.dues', 'update', { source: 'param', key: 'clubUnitId' })
  recordPayment(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('duesRecordId', uuidPipe) duesRecordId: string,
    @Body(new ZodValidationPipe(recordDuesPaymentRequestSchema)) body: RecordDuesPaymentRequest,
  ): Promise<DuesRecord> {
    return this.duesRecords.recordPayment({
      orgUnitId: clubUnitId,
      duesRecordId,
      scope: body.scope,
      amount: body.amount,
      ledgerEntryId: body.ledgerEntryId,
    });
  }
}
