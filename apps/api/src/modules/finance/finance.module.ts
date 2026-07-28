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

@Module({
  imports: [IdentityModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    LedgerEntryRepository,
    LedgerEntryService,
    ClubDuesSettingsRepository,
    DuesRecordRepository,
    DuesRecordService,
  ],
  controllers: [LedgerEntryController, ClubDuesSettingsController, DuesRecordController],
  exports: [LedgerEntryRepository, LedgerEntryService],
})
export class FinanceModule {}
