import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createGuestCommunicationRequestSchema,
  type CreateGuestCommunicationRequest,
  type GuestCommunication,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { GuestService } from './guest.service';
import { GuestCommunicationRepository } from './guest-communication.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 2: system-design.md §11.1's `communications` log. Reuses `membership.guest` — same resource, no new grant. */
@Controller('clubs/:clubUnitId/guests/:guestId/communications')
export class GuestCommunicationController {
  constructor(
    private readonly guests: GuestService,
    private readonly communications: GuestCommunicationRepository,
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
    @Body(new ZodValidationPipe(createGuestCommunicationRequestSchema))
    body: CreateGuestCommunicationRequest,
  ): Promise<GuestCommunication> {
    await this.assertGuestInClub(clubUnitId, guestId);
    return this.communications.create({
      guestId,
      channel: body.channel,
      note: body.note,
      loggedBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('membership.guest', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
  ): Promise<GuestCommunication[]> {
    await this.assertGuestInClub(clubUnitId, guestId);
    return this.communications.findByGuest(guestId);
  }
}
