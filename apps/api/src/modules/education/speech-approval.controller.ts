import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  approveSpeechApprovalRequestSchema,
  denySpeechApprovalRequestSchema,
  listSpeechApprovalsQuerySchema,
  type ApproveSpeechApprovalRequest,
  type DenySpeechApprovalRequest,
  type ListSpeechApprovalsQuery,
  type SpeechApproval,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { SpeechApprovalService } from './speech-approval.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M11 Slice 2: the VPE-facing surface for education-credit approvals. All
 * three routes are club-scoped and gated on the seeded `education.approval`
 * resource — read for the list (VPE + member `own`), approve for either
 * decision (approve/deny are two edges of the same authority, so both use
 * the fixed `approve` action rather than inventing a bespoke one).
 *
 * Deny uses `approve` (not `update`) because "record the VPE's decision" is
 * what the `approve` action names in the closed six-action set; `update`
 * would suggest editing a stored answer, which never happens here.
 */
@Controller('clubs/:clubUnitId/education/approvals')
export class SpeechApprovalController {
  constructor(private readonly service: SpeechApprovalService) {}

  @Get()
  @ResourceScope('education.approval', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query(new ZodValidationPipe(listSpeechApprovalsQuerySchema))
    query: ListSpeechApprovalsQuery,
  ): Promise<SpeechApproval[]> {
    return this.service.list(clubUnitId, query.status);
  }

  @Post(':id/approve')
  @ResourceScope('education.approval', 'approve', { source: 'param', key: 'clubUnitId' })
  approve(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(approveSpeechApprovalRequestSchema))
    _body: ApproveSpeechApprovalRequest,
    @CurrentUser() principal: Principal,
  ): Promise<SpeechApproval> {
    return this.service.approve(id, clubUnitId, principal.userId);
  }

  @Post(':id/deny')
  @ResourceScope('education.approval', 'approve', { source: 'param', key: 'clubUnitId' })
  deny(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(denySpeechApprovalRequestSchema))
    body: DenySpeechApprovalRequest,
    @CurrentUser() principal: Principal,
  ): Promise<SpeechApproval> {
    return this.service.deny(id, clubUnitId, principal.userId, body.reason);
  }
}
