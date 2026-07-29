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
  createMeetingResourceRequestSchema,
  updateMeetingResourceRequestSchema,
  type CreateMeetingResourceRequest,
  type MeetingResource,
  type UpdateMeetingResourceRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MeetingRepository } from './meeting.repository';
import { MeetingResourceRepository } from './meeting-resource.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M9 Slice 4: the meeting page's Resources tab. */
@Controller('clubs/:clubUnitId/meetings/:meetingId/resources')
export class MeetingResourceController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly resources: MeetingResourceRepository,
  ) {}

  private async assertMeetingInClub(clubUnitId: string, meetingId: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
  }

  private async assertResourceInMeeting(meetingId: string, resourceId: string): Promise<void> {
    const resource = await this.resources.findById(resourceId);
    if (!resource || resource.meetingId !== meetingId) {
      throw new NotFoundException('Resource not found');
    }
  }

  @Get()
  @ResourceScope('meeting.resource', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<MeetingResource[]> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.resources.findByMeeting(meetingId);
  }

  @Post()
  @ResourceScope('meeting.resource', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMeetingResourceRequestSchema))
    body: CreateMeetingResourceRequest,
  ): Promise<MeetingResource> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    return this.resources.create({
      meetingId,
      title: body.title,
      description: body.description,
      createdBy: principal.userId,
    });
  }

  @Patch(':resourceId')
  @ResourceScope('meeting.resource', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('resourceId', uuidPipe) resourceId: string,
    @Body(new ZodValidationPipe(updateMeetingResourceRequestSchema))
    body: UpdateMeetingResourceRequest,
  ): Promise<MeetingResource> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.assertResourceInMeeting(meetingId, resourceId);
    return this.resources.update({ id: resourceId, ...body });
  }

  @Delete(':resourceId')
  @HttpCode(204)
  @ResourceScope('meeting.resource', 'delete', { source: 'param', key: 'clubUnitId' })
  async remove(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
    @Param('resourceId', uuidPipe) resourceId: string,
  ): Promise<void> {
    await this.assertMeetingInClub(clubUnitId, meetingId);
    await this.assertResourceInMeeting(meetingId, resourceId);
    await this.resources.delete(resourceId);
  }
}
