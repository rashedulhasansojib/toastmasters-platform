import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createMeetingRoleAssignmentRequestSchema,
  type CreateMeetingRoleAssignmentRequest,
  type MeetingRoleAssignment,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MeetingRepository } from './meeting.repository';
import { MeetingRoleAssignmentRepository } from './meeting-role-assignment.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 3. Same club-scoped-in-the-URL shape as AgendaItemController; no service layer. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/role-assignments')
export class MeetingRoleAssignmentController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly roleAssignments: MeetingRoleAssignmentRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post()
  @ResourceScope('meeting.role', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Body(new ZodValidationPipe(createMeetingRoleAssignmentRequestSchema))
    body: CreateMeetingRoleAssignmentRequest,
  ): Promise<MeetingRoleAssignment> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.roleAssignments.create({
      meetingId,
      roleKey: body.roleKey,
      slotIndex: body.slotIndex,
      assignee: body.assignee,
    });
  }

  @Get()
  @ResourceScope('meeting.role', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<MeetingRoleAssignment[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.roleAssignments.findByMeeting(meetingId);
  }
}
