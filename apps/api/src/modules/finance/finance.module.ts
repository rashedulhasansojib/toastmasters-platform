import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { IdentityModule } from '../identity/identity.module';
import { LedgerEntryRepository } from './ledger-entry.repository';
import { LedgerEntryService } from './ledger-entry.service';
import { LedgerEntryController } from './ledger-entry.controller';
import { ClubDuesSettingsRepository } from './club-dues-settings.repository';
import { ClubDuesSettingsController } from './club-dues-settings.controller';
import { DuesRecordRepository } from './dues-record.repository';
import { DuesRecordService } from './dues-record.service';
import { DuesRecordController } from './dues-record.controller';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';

@Module({
  imports: [IdentityModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    LedgerEntryRepository,
    LedgerEntryService,
    ClubDuesSettingsRepository,
    DuesRecordRepository,
    DuesRecordService,
    InvoiceRepository,
    InvoiceService,
  ],
  controllers: [
    LedgerEntryController,
    ClubDuesSettingsController,
    DuesRecordController,
    InvoiceController,
  ],
  exports: [LedgerEntryRepository, LedgerEntryService],
})
export class FinanceModule {}
