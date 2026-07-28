import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createChecklistRunRequestSchema,
  markChecklistRunItemRequestSchema,
  type CreateChecklistRunRequest,
  type MarkChecklistRunItemRequest,
  type ChecklistRun,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { ChecklistRunRepository } from './checklist-run.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 5. Same club-scoped-in-the-URL shape as AgendaItemController; no service layer. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/checklist-runs')
export class ChecklistRunController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly runs: ChecklistRunRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post()
  @ResourceScope('meeting.checklist', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Body(new ZodValidationPipe(createChecklistRunRequestSchema)) body: CreateChecklistRunRequest,
  ): Promise<ChecklistRun> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.runs.create({ orgUnitId: clubUnitId, templateId: body.templateId, meetingId });
  }

  @Get()
  @ResourceScope('meeting.checklist', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<ChecklistRun[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.runs.findByMeeting(meetingId);
  }

  @Patch(':runId')
  @ResourceScope('meeting.checklist', 'update', { source: 'param', key: 'clubUnitId' })
  async markItem(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('runId', uuidPipe) runId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(markChecklistRunItemRequestSchema))
    body: MarkChecklistRunItemRequest,
  ): Promise<ChecklistRun> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const run = await this.runs.findById(runId);
    if (!run || run.meetingId !== meetingId) {
      throw new NotFoundException('Checklist run not found');
    }
    return this.runs.markItem({
      id: runId,
      key: body.key,
      done: body.done,
      note: body.note,
      doneBy: principal.userId,
    });
  }
}
