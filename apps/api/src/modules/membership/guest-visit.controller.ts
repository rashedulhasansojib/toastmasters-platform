import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createGuestVisitRequestSchema,
  type CreateGuestVisitRequest,
  type GuestVisit,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { GuestService } from './guest.service';
import { GuestVisitRepository } from './guest-visit.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 2: system-design.md §11.1's `visits` log. Reuses `membership.guest` — same resource, no new grant. */
@Controller('clubs/:clubUnitId/guests/:guestId/visits')
export class GuestVisitController {
  constructor(
    private readonly guests: GuestService,
    private readonly visits: GuestVisitRepository,
  ) {}

  private async assertGuestInClub(clubUnitId: string, guestId: string): Promise<void> {
    const guest = await this.guests.findById(guestId);
    if (!guest || guest.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Guest not found');
    }
  }

  @Post()
  @ResourceScope('membership.guest', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createGuestVisitRequestSchema))
    body: CreateGuestVisitRequest,
  ): Promise<GuestVisit> {
    await this.assertGuestInClub(clubUnitId, guestId);
    return this.visits.create({
      guestId,
      meetingId: body.meetingId,
      attendedAt: new Date(body.attendedAt),
      loggedBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('membership.guest', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
  ): Promise<GuestVisit[]> {
    await this.assertGuestInClub(clubUnitId, guestId);
    return this.visits.findByGuest(guestId);
  }
}
