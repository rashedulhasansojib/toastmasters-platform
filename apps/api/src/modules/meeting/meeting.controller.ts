import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createMeetingRequestSchema,
  type CreateMeetingRequest,
  type Meeting,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { MeetingLifecycleRepository } from './meeting-lifecycle.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * Club-scoped in the URL so the guard can resolve scope from `clubUnitId`
 * before touching the database for the target row (Slice 9's ship gate:
 * query-level denial, not filtered-after-fetch).
 */
@Controller('clubs/:clubUnitId/meetings')
export class MeetingController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly lifecycle: MeetingLifecycleRepository,
  ) {}

  @Post()
  @ResourceScope('meeting.meeting', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMeetingRequestSchema)) body: CreateMeetingRequest,
  ): Promise<Meeting> {
    return this.meetings.create({
      clubUnitId,
      programYearId: body.programYearId,
      scheduledAt: new Date(body.scheduledAt),
      createdBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('meeting.meeting', 'read', { source: 'param', key: 'clubUnitId' })
  async list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<Meeting[]> {
    return this.meetings.findByClub(clubUnitId);
  }

  @Get(':meetingId')
  @ResourceScope('meeting.meeting', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<Meeting> {
    const found = await this.meetings.findById(meetingId);
    if (!found || found.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
    return found;
  }

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  /** M3 Slice 11: system-design.md §9.5's lifecycle — see the repository's own scoping note on what's skipped. */
  @Post(':meetingId/publish')
  @ResourceScope('meeting.meeting', 'update', { source: 'param', key: 'clubUnitId' })
  async publish(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<Meeting> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.lifecycle.publish(meetingId);
  }

  @Post(':meetingId/start')
  @ResourceScope('meeting.meeting', 'update', { source: 'param', key: 'clubUnitId' })
  async start(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<Meeting> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.lifecycle.start(meetingId);
  }

  /** Guard: no proposed role assignments remain. Confirmed ones become fulfilled; capability tokens are revoked — same transaction. */
  @Post(':meetingId/close')
  @ResourceScope('meeting.meeting', 'update', { source: 'param', key: 'clubUnitId' })
  async close(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<Meeting> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.lifecycle.close(meetingId);
  }

  @Post(':meetingId/cancel')
  @ResourceScope('meeting.meeting', 'update', { source: 'param', key: 'clubUnitId' })
  async cancel(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<Meeting> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.lifecycle.cancel(meetingId);
  }
}
