import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createInvitationRequestSchema,
  acceptInvitationRequestSchema,
  type CreateInvitationRequest,
  type AcceptInvitationRequest,
  type Invitation,
  type InvitationWithLink,
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
  ): Promise<InvitationWithLink> {
    return this.invitations.create({ actorId: principal.userId, orgUnitId, ...body });
  }

  /** Users admin's pending-invitations column, for the subtree rooted at `orgUnitId`. */
  @Get('org-units/:orgUnitId/invitations')
  @ResourceScope('identity.invitation', 'read', { source: 'param', key: 'orgUnitId' })
  async listPending(@Param('orgUnitId', uuidPipe) orgUnitId: string): Promise<Invitation[]> {
    return this.invitations.listPending(orgUnitId);
  }

  /** `:id` is an invitation id — authorized in-service against the invitation's own org unit, not via @ResourceScope. */
  @Post('invitations/:id/resend')
  @HttpCode(200)
  async resend(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<InvitationWithLink> {
    return this.invitations.resend(id, principal.userId);
  }

  @Post('invitations/:id/revoke')
  @HttpCode(200)
  async revoke(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<Invitation> {
    return this.invitations.revoke(id, principal.userId);
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
