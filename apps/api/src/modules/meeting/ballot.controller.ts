import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createBallotRequestSchema,
  castVoteRequestSchema,
  type CreateBallotRequest,
  type CastVoteRequest,
  type Ballot,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { BallotRepository } from './ballot.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M3 Slice 10. Same club-scoped-in-the-URL shape as this module's other
 * controllers. Vote casting is member-only in this slice — the
 * `all_present`/guest path (via the Slice 6 capability-token primitive) is
 * deferred, so there's no separate @Public() voting route yet.
 */
@Controller('clubs/:clubUnitId/meetings/:meetingId/ballots')
export class BallotController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly ballots: BallotRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post()
  @ResourceScope('meeting.ballot', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createBallotRequestSchema)) body: CreateBallotRequest,
  ): Promise<Ballot> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.ballots.create({
      meetingId,
      category: body.category,
      eligibility: body.eligibility,
      candidates: body.candidates,
      createdBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('meeting.ballot', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<Ballot[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.ballots.findByMeeting(meetingId);
  }

  @Post(':ballotId/votes')
  @ResourceScope('meeting.vote', 'create', { source: 'param', key: 'clubUnitId' })
  async vote(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('ballotId', uuidPipe) ballotId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(castVoteRequestSchema)) body: CastVoteRequest,
  ): Promise<{ ok: true }> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const ballotRecord = await this.ballots.findById(ballotId);
    if (!ballotRecord || ballotRecord.meetingId !== meetingId) {
      throw new NotFoundException('Ballot not found');
    }
    if (ballotRecord.status !== 'open') {
      throw new BadRequestException('Ballot is not open');
    }
    if (!ballotRecord.candidates.some((c) => c.personId === body.candidatePersonId)) {
      throw new BadRequestException('Not a candidate on this ballot');
    }
    await this.ballots.castVote({
      ballotId,
      voterPersonId: principal.userId,
      candidatePersonId: body.candidatePersonId,
    });
    return { ok: true };
  }

  @Post(':ballotId/tally')
  @ResourceScope('meeting.ballot', 'approve', { source: 'param', key: 'clubUnitId' })
  async tally(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('ballotId', uuidPipe) ballotId: string,
    @CurrentUser() principal: Principal,
  ): Promise<Ballot> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const ballotRecord = await this.ballots.findById(ballotId);
    if (!ballotRecord || ballotRecord.meetingId !== meetingId) {
      throw new NotFoundException('Ballot not found');
    }
    return this.ballots.tally({ ballotId, talliedBy: principal.userId });
  }
}
