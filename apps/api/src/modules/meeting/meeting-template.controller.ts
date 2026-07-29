import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createMeetingFromTemplateRequestSchema,
  createMeetingTemplateRequestSchema,
  updateMeetingTemplateRequestSchema,
  type CreateMeetingFromTemplateRequest,
  type CreateMeetingTemplateRequest,
  type Meeting,
  type MeetingTemplate,
  type UpdateMeetingTemplateRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { MeetingTemplateRepository } from './meeting-template.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

const snapshotRequestSchema = z
  .object({ meetingId: z.uuid(), name: z.string().min(1).max(100) })
  .strict();

/**
 * M9 Slice 5: reusable meeting templates — the legacy portal's Templates
 * section and its "Create & Build" dialog.
 *
 * Club-scoped in the URL like every sibling meeting resource; templates are
 * their own aggregate, so this controller is mounted at the club, not under
 * a meeting.
 */
@Controller('clubs/:clubUnitId/meeting-templates')
export class MeetingTemplateController {
  constructor(
    private readonly templates: MeetingTemplateRepository,
    private readonly meetings: MeetingRepository,
  ) {}

  private async assertTemplateInClub(
    clubUnitId: string,
    templateId: string,
  ): Promise<MeetingTemplate> {
    const template = await this.templates.findById(templateId);
    if (!template || template.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting template not found');
    }
    return template;
  }

  @Get()
  @ResourceScope('meeting.template', 'read', { source: 'param', key: 'clubUnitId' })
  async list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<MeetingTemplate[]> {
    return this.templates.findByClub(clubUnitId);
  }

  @Get(':templateId')
  @ResourceScope('meeting.template', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('templateId', uuidPipe) templateId: string,
  ): Promise<MeetingTemplate> {
    return this.assertTemplateInClub(clubUnitId, templateId);
  }

  @Post()
  @ResourceScope('meeting.template', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMeetingTemplateRequestSchema))
    body: CreateMeetingTemplateRequest,
  ): Promise<MeetingTemplate> {
    return this.templates.create({
      clubUnitId,
      createdBy: principal.userId,
      ...body,
      name: body.name,
    });
  }

  /** "Save this meeting as a template" from the meeting page's header. */
  @Post('from-meeting')
  @ResourceScope('meeting.template', 'create', { source: 'param', key: 'clubUnitId' })
  async createFromMeeting(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(snapshotRequestSchema))
    body: z.infer<typeof snapshotRequestSchema>,
  ): Promise<MeetingTemplate> {
    const meeting = await this.meetings.findById(body.meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
    return this.templates.snapshotFromMeeting({
      clubUnitId,
      meetingId: body.meetingId,
      name: body.name,
      createdBy: principal.userId,
    });
  }

  /**
   * "Create & Build": a new meeting with the template's agenda, roles, word
   * of the day and table topics already copied in. Gated on
   * `meeting.meeting: create` — it creates a meeting; reading the template
   * is incidental.
   */
  @Post('create-meeting')
  @ResourceScope('meeting.meeting', 'create', { source: 'param', key: 'clubUnitId' })
  async createMeeting(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMeetingFromTemplateRequestSchema))
    body: CreateMeetingFromTemplateRequest,
  ): Promise<Meeting> {
    const template = await this.assertTemplateInClub(clubUnitId, body.templateId);
    return this.templates.createMeetingFrom({
      template,
      clubUnitId,
      programYearId: body.programYearId,
      scheduledAt: new Date(body.scheduledAt),
      meetingNumber: body.meetingNumber,
      theme: body.theme,
      createdBy: principal.userId,
    });
  }

  @Patch(':templateId')
  @ResourceScope('meeting.template', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('templateId', uuidPipe) templateId: string,
    @Body(new ZodValidationPipe(updateMeetingTemplateRequestSchema))
    body: UpdateMeetingTemplateRequest,
  ): Promise<MeetingTemplate> {
    await this.assertTemplateInClub(clubUnitId, templateId);
    return this.templates.update(templateId, body);
  }

  @Delete(':templateId')
  @HttpCode(204)
  @ResourceScope('meeting.template', 'delete', { source: 'param', key: 'clubUnitId' })
  async remove(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('templateId', uuidPipe) templateId: string,
  ): Promise<void> {
    await this.assertTemplateInClub(clubUnitId, templateId);
    await this.templates.delete(templateId);
  }
}
