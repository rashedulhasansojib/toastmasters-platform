import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createAgendaItemRequestSchema,
  applyAgendaTemplateRequestSchema,
  type CreateAgendaItemRequest,
  type ApplyAgendaTemplateRequest,
  type AgendaItem,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MeetingRepository } from './meeting.repository';
import { AgendaItemRepository } from './agenda-item.repository';
import { AgendaTemplateRepository } from './agenda-template.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 1. Same club-scoped-in-the-URL shape as MeetingController; no service layer, matching that module's own precedent (the meeting-ownership check is inline, same as MeetingController.findOne). */
@Controller('clubs/:clubUnitId/meetings/:meetingId/agenda-items')
export class AgendaItemController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly agendaItems: AgendaItemRepository,
    private readonly templates: AgendaTemplateRepository,
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

  /** M3 Slice 9: bulk-appends a club's agenda template onto this meeting. */
  @Post('from-template')
  @ResourceScope('meeting.agenda_item', 'create', { source: 'param', key: 'clubUnitId' })
  async applyTemplate(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Body(new ZodValidationPipe(applyAgendaTemplateRequestSchema))
    body: ApplyAgendaTemplateRequest,
  ): Promise<AgendaItem[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const template = await this.templates.findById(body.templateId);
    if (!template || template.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Agenda template not found');
    }
    return this.agendaItems.createFromTemplate(
      meetingId,
      template.items
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          title: item.title,
          plannedDurationSeconds: item.plannedDurationSeconds,
          roleKey: item.roleKey,
        })),
    );
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
