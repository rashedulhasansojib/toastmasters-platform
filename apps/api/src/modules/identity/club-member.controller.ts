import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { ClubMemberSummary } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { ClubMembershipRepository } from './club-membership.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M9: the club's own member roster, so the meeting page can offer a member
 * picker rather than asking an officer to paste a person UUID.
 *
 * Club-scoped in the URL, gated on its own `identity.club_member` resource
 * — granted to club roles only. The oversight tiers never hold it: they see
 * counts and projections, never member detail (FR-OVS-3).
 */
@Controller('clubs/:clubUnitId/members')
export class ClubMemberController {
  constructor(private readonly memberships: ClubMembershipRepository) {}

  @Get()
  @ResourceScope('identity.club_member', 'read', { source: 'param', key: 'clubUnitId' })
  async list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<ClubMemberSummary[]> {
    return this.memberships.findActiveSummariesByClub(clubUnitId);
  }
}
