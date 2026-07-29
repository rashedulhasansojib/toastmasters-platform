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
  createMeetingGuestRequestSchema,
  updateMeetingGuestRequestSchema,
  type CreateMeetingGuestRequest,
  type MeetingGuest,
  type UpdateMeetingGuestRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { MeetingGuestRepository } from './meeting-guest.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M9 Slice 2: meeting Guest List. Same club-scoped-in-the-URL shape as sibling meeting sub-resources. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/guests')
export class MeetingGuestController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly guests: MeetingGuestRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  private async assertGuestInMeeting(meetingId: string, guestId: string): Promise<MeetingGuest> {
    const guest = await this.guests.findById(guestId);
    if (!guest || guest.meetingId !== meetingId) {
      throw new NotFoundException('Guest not found');
    }
    return guest;
  }

  @Post()
  @ResourceScope('meeting.guest', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMeetingGuestRequestSchema))
    body: CreateMeetingGuestRequest,
  ): Promise<MeetingGuest> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.guests.create({
      meetingId,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      notes: body.notes,
      prospectId: body.prospectId,
      addedBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('meeting.guest', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<MeetingGuest[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.guests.findByMeeting(meetingId);
  }

  @Patch(':guestId')
  @ResourceScope('meeting.guest', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('guestId', uuidPipe) guestId: string,
    @Body(new ZodValidationPipe(updateMeetingGuestRequestSchema))
    body: UpdateMeetingGuestRequest,
  ): Promise<MeetingGuest> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.assertGuestInMeeting(meetingId, guestId);
    return this.guests.update({ id: guestId, ...body });
  }

  @Delete(':guestId')
  @HttpCode(204)
  @ResourceScope('meeting.guest', 'delete', { source: 'param', key: 'clubUnitId' })
  async remove(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('guestId', uuidPipe) guestId: string,
  ): Promise<void> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.assertGuestInMeeting(meetingId, guestId);
    await this.guests.delete(guestId);
  }
}
