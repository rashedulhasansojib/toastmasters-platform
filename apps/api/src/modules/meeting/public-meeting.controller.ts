import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { PublicMeetingSummary } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/auth/public.decorator';
import { MeetingRepository } from './meeting.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 10: a club's public page — no auth, no capability token (viewing a published schedule is information, not a guest interaction). */
@Controller('public/clubs/:clubUnitId/meetings')
export class PublicMeetingController {
  constructor(private readonly meetings: MeetingRepository) {}

  @Public()
  @Get('upcoming')
  async upcoming(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
  ): Promise<PublicMeetingSummary[]> {
    const meetings = await this.meetings.findUpcomingPublished(clubUnitId);
    return meetings.map((m) => ({ id: m.id, scheduledAt: m.scheduledAt }));
  }
}
