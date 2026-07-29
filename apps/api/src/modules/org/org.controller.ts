import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createOrgUnitChildRequestSchema,
  reparentOrgUnitRequestSchema,
  updateOrgUnitRequestSchema,
  type CreateOrgUnitChildRequest,
  type ReparentOrgUnitRequest,
  type UpdateOrgUnitRequest,
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

  @Patch('org-units/:orgUnitId')
  @ResourceScope('org.unit', 'update', { source: 'param', key: 'orgUnitId' })
  async update(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(updateOrgUnitRequestSchema)) body: UpdateOrgUnitRequest,
  ): Promise<OrgUnit> {
    return this.orgUnits.update({ actorId: principal.userId, orgUnitId, ...body });
  }

  /** Empty units only — the service 409s with the blocking relations listed. */
  @Delete('org-units/:orgUnitId')
  @ResourceScope('org.unit', 'delete', { source: 'param', key: 'orgUnitId' })
  @HttpCode(200)
  async remove(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @CurrentUser() principal: Principal,
  ): Promise<{ success: true }> {
    await this.orgUnits.remove({ actorId: principal.userId, orgUnitId });
    return { success: true };
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
