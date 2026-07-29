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
  createSpeechSlotRequestSchema,
  decideSpeechSlotRequestSchema,
  updateSpeechSlotRequestSchema,
  type CreateSpeechSlotRequest,
  type DecideSpeechSlotRequest,
  type SpeechSlot,
  type UpdateSpeechSlotRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { SpeechSlotRepository } from './speech-slot.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 4. Same club-scoped-in-the-URL shape as AgendaItemController; no service layer. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/speech-slots')
export class SpeechSlotController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly speechSlots: SpeechSlotRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  @Post()
  @ResourceScope('meeting.speech_slot', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createSpeechSlotRequestSchema)) body: CreateSpeechSlotRequest,
  ): Promise<SpeechSlot> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.speechSlots.create({
      meetingId,
      title: body.title,
      pathCode: body.pathCode,
      projectCode: body.projectCode,
      plannedDurationSeconds: body.plannedDurationSeconds,
      requestedBy: principal.userId,
      speakerPersonId: body.speakerPersonId,
      evaluatorPersonId: body.evaluatorPersonId,
      notes: body.notes,
    });
  }

  @Get()
  @ResourceScope('meeting.speech_slot', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<SpeechSlot[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.speechSlots.findByMeeting(meetingId);
  }

  @Patch(':speechSlotId')
  @ResourceScope('meeting.speech_slot', 'approve', { source: 'param', key: 'clubUnitId' })
  async decide(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('speechSlotId', uuidPipe) speechSlotId: string,
    @Body(new ZodValidationPipe(decideSpeechSlotRequestSchema)) body: DecideSpeechSlotRequest,
  ): Promise<SpeechSlot> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    const slot = await this.speechSlots.findById(speechSlotId);
    if (!slot || slot.meetingId !== meetingId) {
      throw new NotFoundException('Speech slot not found');
    }
    return this.speechSlots.decide(speechSlotId, body.status);
  }
  /**
   * M9: edit the slot from the agenda's Prepared Speakers block — speaker,
   * evaluator, title, path/project, duration, notes, running order.
   *
   * Gated on `update`, not `approve`: rewriting the agenda is ordinary
   * editing, whereas approving a member's request is the distinct decision
   * the `approve` action exists for (CLAUDE.md §5).
   */
  @Patch(':speechSlotId/details')
  @ResourceScope('meeting.speech_slot', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('speechSlotId', uuidPipe) speechSlotId: string,
    @Body(new ZodValidationPipe(updateSpeechSlotRequestSchema)) body: UpdateSpeechSlotRequest,
  ): Promise<SpeechSlot> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.assertSlotInMeeting(meetingId, speechSlotId);
    return this.speechSlots.update(speechSlotId, body);
  }

  @Delete(':speechSlotId')
  @HttpCode(204)
  @ResourceScope('meeting.speech_slot', 'update', { source: 'param', key: 'clubUnitId' })
  async remove(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('speechSlotId', uuidPipe) speechSlotId: string,
  ): Promise<void> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.assertSlotInMeeting(meetingId, speechSlotId);
    await this.speechSlots.delete(speechSlotId);
  }

  private async assertSlotInMeeting(meetingId: string, speechSlotId: string): Promise<void> {
    const slot = await this.speechSlots.findById(speechSlotId);
    if (!slot || slot.meetingId !== meetingId) {
      throw new NotFoundException('Speech slot not found');
    }
  }
}
