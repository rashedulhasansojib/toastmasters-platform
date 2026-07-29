import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createMeetingRoleAssignmentRequestSchema,
  updateMeetingRoleAssignmentStatusRequestSchema,
  meetingRoleKey,
  type CreateMeetingRoleAssignmentRequest,
  type UpdateMeetingRoleAssignmentStatusRequest,
  type MeetingRoleAssignment,
  type RoleRotationSuggestion,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MeetingRepository } from './meeting.repository';
import { MeetingRoleAssignmentRepository } from './meeting-role-assignment.repository';
import { RoleRotationRepository } from './role-rotation.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());
const roleKeyPipe = new ZodValidationPipe(meetingRoleKey);

/** M3 Slice 3. Same club-scoped-in-the-URL shape as AgendaItemController; no service layer. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/role-assignments')
export class MeetingRoleAssignmentController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly roleAssignments: MeetingRoleAssignmentRepository,
    private readonly rotation: RoleRotationRepository,
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

  /** M3 Slice 11: confirm/decline a proposed assignment — the transition Slice 3 deferred. Required before guarded close-out's "no proposed roles remain" guard can ever pass on a meeting with any roles at all. */
  @Patch(':roleAssignmentId')
  @ResourceScope('meeting.role', 'update', { source: 'param', key: 'clubUnitId' })
  async updateStatus(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('roleAssignmentId', uuidPipe) roleAssignmentId: string,
    @Body(new ZodValidationPipe(updateMeetingRoleAssignmentStatusRequestSchema))
    body: UpdateMeetingRoleAssignmentStatusRequest,
  ): Promise<MeetingRoleAssignment> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const assignments = await this.roleAssignments.findByMeeting(meetingId);
    if (!assignments.some((a) => a.id === roleAssignmentId)) {
      throw new NotFoundException('Role assignment not found');
    }
    return this.roleAssignments.updateStatus({
      id: roleAssignmentId,
      status: body.status,
      declinedReason: body.declinedReason,
    });
  }

  /** M3 Slice 8: system-design.md §9.3 — ranked suggestions, never auto-assignment. Reuses meeting.role:read — no new resource. */
  @Get('suggestions')
  @ResourceScope('meeting.role', 'read', { source: 'param', key: 'clubUnitId' })
  async suggestions(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Query('roleKey', roleKeyPipe) roleKey: z.infer<typeof meetingRoleKey>,
  ): Promise<RoleRotationSuggestion[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.rotation.suggest({ clubUnitId, meetingId, roleKey });
  }
  /**
   * M9: withdraw a role proposal, so the agenda's role grid can be
   * reassigned to someone else.
   *
   * Restricted to `proposed` — an assignment the assignee has already
   * answered, or one the meeting close-out has settled, is history and is
   * superseded via PATCH, never removed. A non-proposed target is a 409,
   * not a silent no-op.
   */
  @Delete(':roleAssignmentId')
  @HttpCode(204)
  @ResourceScope('meeting.role', 'update', { source: 'param', key: 'clubUnitId' })
  async withdraw(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('roleAssignmentId', uuidPipe) roleAssignmentId: string,
  ): Promise<void> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const assignment = await this.roleAssignments.findById(roleAssignmentId);
    if (!assignment || assignment.meetingId !== meetingId) {
      throw new NotFoundException('Role assignment not found');
    }
    if (assignment.status !== 'proposed') {
      throw new ConflictException(
        'Only a proposed assignment can be withdrawn; decline it instead.',
      );
    }
    await this.roleAssignments.deleteProposed(roleAssignmentId);
  }
}
