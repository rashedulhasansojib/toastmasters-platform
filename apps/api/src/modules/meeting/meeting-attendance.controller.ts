import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  recordMeetingAttendanceRequestSchema,
  type MeetingAttendanceRecord,
  type MeetingAttendanceRosterEntry,
  type RecordMeetingAttendanceRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { MeetingAttendanceRepository } from './meeting-attendance.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M9 Slice 3: member attendance headcount.
 *
 * There is deliberately no PATCH/DELETE — attendance is append-only
 * (NFR-4), so a correction is another POST. The `meeting.attendance`
 * resource only allows `read`/`create` for the same reason.
 */
@Controller('clubs/:clubUnitId/meetings/:meetingId/attendance')
export class MeetingAttendanceController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly attendance: MeetingAttendanceRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  /** The roster the tab renders: active members joined to their latest record. */
  @Get()
  @ResourceScope('meeting.attendance', 'read', { source: 'param', key: 'clubUnitId' })
  async roster(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<MeetingAttendanceRosterEntry[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.attendance.roster(clubUnitId, meetingId);
  }

  /** The append-only history, including superseded rows. */
  @Get('history')
  @ResourceScope('meeting.attendance', 'read', { source: 'param', key: 'clubUnitId' })
  async history(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<MeetingAttendanceRecord[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.attendance.history(meetingId);
  }

  @Post()
  @ResourceScope('meeting.attendance', 'create', { source: 'param', key: 'clubUnitId' })
  async record(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(recordMeetingAttendanceRequestSchema))
    body: RecordMeetingAttendanceRequest,
  ): Promise<MeetingAttendanceRecord[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.attendance.record({
      meetingId,
      entries: body.entries,
      recordedBy: principal.userId,
    });
  }
}
