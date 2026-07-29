import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { InventoryItemRepository } from './inventory-item.repository';
import { InventoryMovementRepository } from './inventory-movement.repository';
import { InventoryItemService } from './inventory-item.service';
import { InventoryItemController } from './inventory-item.controller';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    InventoryItemRepository,
    InventoryMovementRepository,
    InventoryItemService,
  ],
  controllers: [InventoryItemController],
  exports: [InventoryItemRepository, InventoryItemService],
})
export class OperationsModule {}
