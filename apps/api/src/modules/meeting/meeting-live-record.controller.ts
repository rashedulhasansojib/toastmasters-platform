import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createMeetingLiveRecordRequestSchema,
  type CreateMeetingLiveRecordRequest,
  type MeetingLiveRecord,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { MeetingLiveRecordRepository } from './meeting-live-record.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 7. Same club-scoped-in-the-URL shape as AgendaItemController; no service layer. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/live-records')
export class MeetingLiveRecordController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly liveRecords: MeetingLiveRecordRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post()
  @ResourceScope('meeting.live_record', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMeetingLiveRecordRequestSchema))
    body: CreateMeetingLiveRecordRequest,
  ): Promise<MeetingLiveRecord> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.liveRecords.create({
      meetingId,
      kind: body.kind,
      clientKey: body.clientKey,
      targetKey: body.targetKey,
      targetRoleAssignmentId: body.targetRoleAssignmentId,
      targetLabel: body.targetLabel,
      payload: body.payload,
      recordedBy: principal.userId,
    });
  }

  /**
   * The current report, not the raw log: the newest row per (kind, targetKey).
   * Superseded revisions stay in the table as append-only history — pass
   * `?targetKey=` to read one target's full revision list.
   */
  @Get()
  @ResourceScope('meeting.live_record', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Query('targetKey', new ZodValidationPipe(z.string().min(1).optional()))
    targetKey?: string,
  ): Promise<MeetingLiveRecord[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return targetKey
      ? this.liveRecords.findHistory(meetingId, targetKey)
      : this.liveRecords.findLatestByMeeting(meetingId);
  }
}
