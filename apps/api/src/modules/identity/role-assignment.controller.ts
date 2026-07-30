import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createRoleAssignmentRequestSchema,
  endRoleAssignmentRequestSchema,
  type CreateRoleAssignmentRequest,
  type CreateRoleAssignmentResponse,
  type EndRoleAssignmentRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { RoleAssignmentService } from './role-assignment.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * Users admin: tier-agnostic role assignment (any org-unit type, not just a
 * club), distinct from identity.controller.ts's pre-existing club-scoped
 * route, which is left unchanged.
 */
@Controller()
export class RoleAssignmentController {
  constructor(private readonly roleAssignments: RoleAssignmentService) {}

  @Post('org-units/:orgUnitId/role-assignments')
  @ResourceScope('identity.role_assignment', 'create', { source: 'param', key: 'orgUnitId' })
  async assign(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createRoleAssignmentRequestSchema))
    body: CreateRoleAssignmentRequest,
  ): Promise<CreateRoleAssignmentResponse> {
    return this.roleAssignments.assign({
      actorId: principal.userId,
      orgUnitId,
      personId: body.personId,
      role: body.role,
      programYearId: body.programYearId,
      termStart: new Date(body.termStart),
      termEnd: new Date(body.termEnd),
      memberType: body.memberType,
    });
  }

  /** `:id` is a role-assignment id — authorized in-service, not via @ResourceScope (see RoleAssignmentService.end). */
  @Post('role-assignments/:id/end')
  @HttpCode(200)
  async end(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(endRoleAssignmentRequestSchema)) body: EndRoleAssignmentRequest,
  ): Promise<{ success: true }> {
    await this.roleAssignments.end(id, body.reason, principal.userId);
    return { success: true };
  }
}
