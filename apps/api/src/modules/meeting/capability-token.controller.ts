import { Body, Controller, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  issueCapabilityTokenRequestSchema,
  verifyCapabilityTokenRequestSchema,
  type IssueCapabilityTokenRequest,
  type VerifyCapabilityTokenRequest,
  type CapabilityTokenIssued,
  type CapabilityTokenVerification,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { CapabilityTokenService } from './capability-token.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M3 Slice 6. Issue/revoke are club-scoped and authenticated, matching this
 * module's precedent. `verify` is guest-facing — @Public(), no clubUnitId in
 * the path, matching InvitationController's split between the authenticated
 * create and the public accept.
 */
@Controller()
export class CapabilityTokenController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly tokens: CapabilityTokenService,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post('clubs/:clubUnitId/meetings/:meetingId/capability-tokens')
  @ResourceScope('meeting.capability_token', 'create', { source: 'param', key: 'clubUnitId' })
  async issue(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(issueCapabilityTokenRequestSchema))
    body: IssueCapabilityTokenRequest,
  ): Promise<CapabilityTokenIssued> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.tokens.issue({
      meetingId,
      purpose: body.purpose,
      ttlMinutes: body.ttlMinutes,
      actorId: principal.userId,
    });
  }

  @Patch('clubs/:clubUnitId/meetings/:meetingId/capability-tokens/:tokenId/revoke')
  @ResourceScope('meeting.capability_token', 'update', { source: 'param', key: 'clubUnitId' })
  @HttpCode(204)
  async revoke(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('tokenId', uuidPipe) tokenId: string,
  ): Promise<void> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.tokens.revoke(tokenId);
  }

  @Public()
  @Post('capability-tokens/verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodValidationPipe(verifyCapabilityTokenRequestSchema))
    body: VerifyCapabilityTokenRequest,
  ): Promise<CapabilityTokenVerification> {
    return this.tokens.verify(body.token);
  }
}
