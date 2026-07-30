import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createRoleAssignmentRequestSchema,
  endRoleAssignmentRequestSchema,
  type CreateRoleAssignmentRequest,
  type CreateRoleAssignmentResponse,
  type EndRoleAssignmentRequest,
  type RoleAssignment,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { RoleAssignmentService } from './role-assignment.service';
import { RoleAssignmentRepository } from './role-assignment.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * Users admin: tier-agnostic role assignment (any org-unit type, not just a
 * club), distinct from identity.controller.ts's pre-existing club-scoped
 * route, which is left unchanged.
 */
@Controller()
export class RoleAssignmentController {
  constructor(
    private readonly roleAssignments: RoleAssignmentService,
    private readonly roleAssignmentRepository: RoleAssignmentRepository,
  ) {}

  /**
   * CLAUDE.md §2 decision 11 (2026-07-30): backs the VP Membership
   * dashboard's landing redirect — the caller's own active roles in one
   * club. No `@ResourceScope`: this is the caller's own data, same
   * reasoning as `/auth/me`, not a lookup of someone else's assignments.
   */
  @Get('clubs/:clubUnitId/role-assignments/mine')
  mine(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
  ): Promise<RoleAssignment[]> {
    return this.roleAssignmentRepository.findActiveByPersonAndUnit(principal.userId, clubUnitId);
  }

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
