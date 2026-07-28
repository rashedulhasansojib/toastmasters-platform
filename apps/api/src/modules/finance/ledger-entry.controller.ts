import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createLedgerEntryRequestSchema,
  reverseLedgerEntryRequestSchema,
  type CreateLedgerEntryRequest,
  type ReverseLedgerEntryRequest,
  type LedgerEntry,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { LedgerEntryService } from './ledger-entry.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 5: system-design.md §12.1. `finance.ledger` is `restricted` sensitivity — already excluded from wildcard/support grants in the seed (M1 Slice 3). */
@Controller('clubs/:clubUnitId/ledger-entries')
export class LedgerEntryController {
  constructor(private readonly entries: LedgerEntryService) {}

  @Post()
  @ResourceScope('finance.ledger', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createLedgerEntryRequestSchema)) body: CreateLedgerEntryRequest,
  ): Promise<LedgerEntry> {
    return this.entries.create({ ...body, orgUnitId: clubUnitId, recordedBy: principal.userId });
  }

  @Get()
  @ResourceScope('finance.ledger', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<LedgerEntry[]> {
    return this.entries.list(clubUnitId);
  }

  /** Corrections are new reversing entries — the ledger never accepts an UPDATE or DELETE (enforced at the DB layer too). */
  @Post(':entryId/reverse')
  @ResourceScope('finance.ledger', 'update', { source: 'param', key: 'clubUnitId' })
  reverse(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('entryId', uuidPipe) entryId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(reverseLedgerEntryRequestSchema)) body: ReverseLedgerEntryRequest,
  ): Promise<LedgerEntry> {
    return this.entries.reverse({
      orgUnitId: clubUnitId,
      entryId,
      reason: body.reason,
      recordedBy: principal.userId,
    });
  }
}
