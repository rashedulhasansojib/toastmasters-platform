import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createRoleAssignmentRequestSchema,
  type CreateRoleAssignmentRequest,
  type RoleAssignment,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { RoleAssignmentRepository } from './role-assignment.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** Officer appointment — e.g. a President assigning a VPE (prd.md FR-ACC-8, the M1 ship gate). */
@Controller('clubs/:clubUnitId/role-assignments')
export class IdentityController {
  constructor(private readonly roleAssignments: RoleAssignmentRepository) {}

  @Post()
  @ResourceScope('identity.role_assignment', 'create', { source: 'param', key: 'clubUnitId' })
  async assign(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createRoleAssignmentRequestSchema))
    body: CreateRoleAssignmentRequest,
  ): Promise<RoleAssignment> {
    return this.roleAssignments.assign({
      personId: body.personId,
      orgUnitId: clubUnitId,
      role: body.role,
      programYearId: body.programYearId,
      termStart: new Date(body.termStart),
      termEnd: new Date(body.termEnd),
      appointedBy: principal.userId,
    });
  }
}
