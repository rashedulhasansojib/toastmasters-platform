import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createMentorshipPairingRequestSchema,
  addMentorshipCheckInRequestSchema,
  endMentorshipPairingRequestSchema,
  setMentorAvailabilityRequestSchema,
  type CreateMentorshipPairingRequest,
  type AddMentorshipCheckInRequest,
  type EndMentorshipPairingRequest,
  type SetMentorAvailabilityRequest,
  type MentorshipPairing,
  type MentorAvailability,
  type MentorshipSuggestion,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MentorshipService } from './mentorship.service';
import { MentorAvailabilityRepository } from './mentor-availability.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M7 Slice 3: system-design.md §10.3. `education.mentorship` covers pairings and availability. */
@Controller('clubs/:clubUnitId/mentorship')
export class MentorshipController {
  constructor(
    private readonly mentorship: MentorshipService,
    private readonly availability: MentorAvailabilityRepository,
  ) {}

  @Post('availability')
  @ResourceScope('education.mentorship', 'update', { source: 'param', key: 'clubUnitId' })
  setAvailability(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(setMentorAvailabilityRequestSchema))
    body: SetMentorAvailabilityRequest,
  ): Promise<MentorAvailability> {
    return this.availability.upsert({ orgUnitId: clubUnitId, personId: principal.userId, ...body });
  }

  @Get('suggestions')
  @ResourceScope('education.mentorship', 'read', { source: 'param', key: 'clubUnitId' })
  suggest(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query('menteePersonId', uuidPipe) menteePersonId: string,
  ): Promise<MentorshipSuggestion[]> {
    return this.mentorship.suggest(clubUnitId, menteePersonId);
  }

  @Post('pairings')
  @ResourceScope('education.mentorship', 'create', { source: 'param', key: 'clubUnitId' })
  createPairing(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createMentorshipPairingRequestSchema))
    body: CreateMentorshipPairingRequest,
  ): Promise<MentorshipPairing> {
    return this.mentorship.create({ orgUnitId: clubUnitId, assignedBy: principal.userId, ...body });
  }

  @Get('pairings')
  @ResourceScope('education.mentorship', 'read', { source: 'param', key: 'clubUnitId' })
  listPairings(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<MentorshipPairing[]> {
    return this.mentorship.list(clubUnitId);
  }

  @Post('pairings/:id/check-ins')
  @ResourceScope('education.mentorship', 'update', { source: 'param', key: 'clubUnitId' })
  addCheckIn(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(addMentorshipCheckInRequestSchema))
    body: AddMentorshipCheckInRequest,
  ): Promise<MentorshipPairing> {
    return this.mentorship.addCheckIn(id, principal.userId, body.note, body.nextDueOn);
  }

  @Post('pairings/:id/end')
  @ResourceScope('education.mentorship', 'update', { source: 'param', key: 'clubUnitId' })
  end(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(endMentorshipPairingRequestSchema))
    body: EndMentorshipPairingRequest,
  ): Promise<MentorshipPairing> {
    return this.mentorship.end(id, body.reason);
  }
}
