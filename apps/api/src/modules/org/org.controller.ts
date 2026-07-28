import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createOrgUnitChildRequestSchema,
  reparentOrgUnitRequestSchema,
  type CreateOrgUnitChildRequest,
  type ReparentOrgUnitRequest,
  type OrgUnit,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { OrgUnitService } from './org.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** The org tree editor (system-design.md §5.1, FR-ORG-3, the M2 slice 2 mechanism). */
@Controller()
export class OrgUnitController {
  constructor(private readonly orgUnits: OrgUnitService) {}

  @Post('org-units/:parentId/children')
  @ResourceScope('org.unit', 'create', { source: 'param', key: 'parentId' })
  async createChild(
    @Param('parentId', uuidPipe) parentId: string,
    @Body(new ZodValidationPipe(createOrgUnitChildRequestSchema)) body: CreateOrgUnitChildRequest,
  ): Promise<OrgUnit> {
    return this.orgUnits.createChild({ parentId, ...body });
  }

  @Post('org-units/:orgUnitId/reparent')
  @ResourceScope('org.unit', 'update', { source: 'param', key: 'orgUnitId' })
  @HttpCode(200)
  async reparent(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(reparentOrgUnitRequestSchema)) body: ReparentOrgUnitRequest,
  ): Promise<{ success: true }> {
    await this.orgUnits.reparent({
      actorId: principal.userId,
      orgUnitId,
      newParentId: body.newParentId,
    });
    return { success: true };
  }
}
