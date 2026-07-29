import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createInventoryItemRequestSchema,
  updateInventoryItemRequestSchema,
  createInventoryMovementRequestSchema,
  type CreateInventoryItemRequest,
  type UpdateInventoryItemRequest,
  type CreateInventoryMovementRequest,
  type InventoryItem,
  type InventoryMovement,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { InventoryItemService } from './inventory-item.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M5 Slice 3: system-design.md §14.2. `operations.inventory` — SAA-owned. */
@Controller('clubs/:clubUnitId/inventory')
export class InventoryItemController {
  constructor(private readonly items: InventoryItemService) {}

  @Post()
  @ResourceScope('operations.inventory', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createInventoryItemRequestSchema))
    body: CreateInventoryItemRequest,
  ): Promise<InventoryItem> {
    return this.items.create(clubUnitId, principal.userId, body);
  }

  @Get()
  @ResourceScope('operations.inventory', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<InventoryItem[]> {
    return this.items.list(clubUnitId);
  }

  @Patch(':id')
  @ResourceScope('operations.inventory', 'update', { source: 'param', key: 'clubUnitId' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(updateInventoryItemRequestSchema))
    body: UpdateInventoryItemRequest,
  ): Promise<InventoryItem> {
    return this.items.update(id, body);
  }

  @Get(':id/movements')
  @ResourceScope('operations.inventory', 'read', { source: 'param', key: 'clubUnitId' })
  listMovements(@Param('id', uuidPipe) id: string): Promise<InventoryMovement[]> {
    return this.items.listMovements(id);
  }

  @Post(':id/movements')
  @ResourceScope('operations.inventory', 'update', { source: 'param', key: 'clubUnitId' })
  recordMovement(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createInventoryMovementRequestSchema))
    body: CreateInventoryMovementRequest,
  ): Promise<InventoryMovement> {
    return this.items.recordMovement(clubUnitId, id, principal.userId, body);
  }
}
