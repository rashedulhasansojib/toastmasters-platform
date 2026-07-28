import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createUnitPolicyGrantRequestSchema,
  type CreateUnitPolicyGrantRequest,
  type UnitPolicyGrant,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { UnitPolicyService } from './unit-policy.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** Per-unit permission overrides (prd.md FR-AUTHZ-9/10, the M2 slice 3 mechanism). */
@Controller()
export class UnitPolicyController {
  constructor(private readonly unitPolicies: UnitPolicyService) {}

  @Post('org-units/:orgUnitId/unit-policies')
  @ResourceScope('access.unit_policy', 'create', { source: 'param', key: 'orgUnitId' })
  async create(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createUnitPolicyGrantRequestSchema))
    body: CreateUnitPolicyGrantRequest,
  ): Promise<UnitPolicyGrant> {
    return this.unitPolicies.create({
      actorId: principal.userId,
      orgUnitId,
      subjectRole: body.subjectRole,
      resource: body.resource,
      action: body.action,
      effect: body.effect,
      reason: body.reason,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
  }
}
