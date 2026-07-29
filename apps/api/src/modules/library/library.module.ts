import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { StorageModule } from '../../common/storage/storage.module';
import { LibraryItemRepository } from './library-item.repository';
import { LibraryItemService } from './library-item.service';
import { LibraryItemController } from './library-item.controller';
import { GovernanceDocumentController } from './governance-document.controller';
import { ContentPlanItemRepository } from './content-plan-item.repository';
import { ContentPlanItemController } from './content-plan-item.controller';

@Module({
  imports: [StorageModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    LibraryItemRepository,
    LibraryItemService,
    ContentPlanItemRepository,
  ],
  controllers: [LibraryItemController, GovernanceDocumentController, ContentPlanItemController],
  exports: [LibraryItemRepository, LibraryItemService],
})
export class LibraryModule {}
