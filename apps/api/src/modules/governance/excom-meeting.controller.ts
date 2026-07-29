import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createExComMeetingRequestSchema,
  updateExComMeetingRequestSchema,
  setExComMeetingStatusRequestSchema,
  type CreateExComMeetingRequest,
  type UpdateExComMeetingRequest,
  type SetExComMeetingStatusRequest,
  type ExComMeeting,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { ExComMeetingRepository } from './excom-meeting.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M8 Slice 1: system-design.md §13.1, FR-GOV-1. */
@Controller('clubs/:clubUnitId/excom-meetings')
export class ExComMeetingController {
  constructor(private readonly meetings: ExComMeetingRepository) {}

  @Post()
  @ResourceScope('governance.excom_meeting', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createExComMeetingRequestSchema))
    body: CreateExComMeetingRequest,
  ): Promise<ExComMeeting> {
    return this.meetings.create({
      orgUnitId: clubUnitId,
      programYearId: body.programYearId,
      heldAt: new Date(body.heldAt),
      location: body.location,
      calledBy: principal.userId,
      quorumRule: body.quorumRule,
      agenda: body.agenda,
    });
  }

  @Get()
  @ResourceScope('governance.excom_meeting', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<ExComMeeting[]> {
    return this.meetings.findByClub(clubUnitId);
  }

  @Patch(':id')
  @ResourceScope('governance.excom_meeting', 'update', { source: 'param', key: 'clubUnitId' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(updateExComMeetingRequestSchema))
    body: UpdateExComMeetingRequest,
  ): Promise<ExComMeeting> {
    return this.meetings.update(id, body);
  }

  @Post(':id/status')
  @ResourceScope('governance.excom_meeting', 'update', { source: 'param', key: 'clubUnitId' })
  setStatus(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(setExComMeetingStatusRequestSchema))
    body: SetExComMeetingStatusRequest,
  ): Promise<ExComMeeting> {
    return this.meetings.setStatus(id, body.status);
  }
}
