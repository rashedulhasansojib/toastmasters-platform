import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createAgendaItemRequestSchema,
  type CreateAgendaItemRequest,
  type AgendaItem,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MeetingRepository } from './meeting.repository';
import { AgendaItemRepository } from './agenda-item.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 1. Same club-scoped-in-the-URL shape as MeetingController; no service layer, matching that module's own precedent (the meeting-ownership check is inline, same as MeetingController.findOne). */
@Controller('clubs/:clubUnitId/meetings/:meetingId/agenda-items')
export class AgendaItemController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly agendaItems: AgendaItemRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post()
  @ResourceScope('meeting.agenda_item', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Body(new ZodValidationPipe(createAgendaItemRequestSchema)) body: CreateAgendaItemRequest,
  ): Promise<AgendaItem> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.agendaItems.create({
      meetingId,
      title: body.title,
      plannedDurationSeconds: body.plannedDurationSeconds,
      roleKey: body.roleKey,
    });
  }

  @Get()
  @ResourceScope('meeting.agenda_item', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<AgendaItem[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.agendaItems.findByMeeting(meetingId);
  }
}
