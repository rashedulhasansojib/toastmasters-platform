import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { LedgerEntryService } from './ledger-entry.service';
import { LedgerEntryController } from './ledger-entry.controller';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    LedgerEntryRepository,
    LedgerEntryService,
  ],
  controllers: [LedgerEntryController],
  exports: [LedgerEntryRepository, LedgerEntryService],
})
export class FinanceModule {}
