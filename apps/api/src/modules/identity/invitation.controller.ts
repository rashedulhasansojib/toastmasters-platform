import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createInvitationRequestSchema,
  acceptInvitationRequestSchema,
  type CreateInvitationRequest,
  type AcceptInvitationRequest,
  type Invitation,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { InvitationService } from './invitation.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** Top-down district building by invitation (prd.md FR-ACC-4/5/6, the M2 ship gate). */
@Controller()
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('org-units/:orgUnitId/invitations')
  @ResourceScope('identity.invitation', 'create', { source: 'param', key: 'orgUnitId' })
  async create(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
  ): Promise<Invitation> {
    return this.invitations.create({ actorId: principal.userId, orgUnitId, ...body });
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest,
  ): Promise<{ personId: string }> {
    return this.invitations.accept(token, body);
  }
}
