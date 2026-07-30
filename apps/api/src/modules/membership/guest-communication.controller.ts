import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createGuestCommunicationRequestSchema,
  updateGuestCommunicationRequestSchema,
  type CreateGuestCommunicationRequest,
  type UpdateGuestCommunicationRequest,
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

  /** Filer-only: RBAC lets any VPM in scope update/delete on `membership.guest`, but a contact-log entry is authored by one person and only they get to revise it. */
  private async findOwnEntry(
    guestId: string,
    communicationId: string,
    principalId: string,
  ): Promise<GuestCommunication> {
    const entry = await this.communications.findById(communicationId);
    if (!entry || entry.guestId !== guestId) {
      throw new NotFoundException('Contact log entry not found');
    }
    if (entry.loggedBy !== principalId) {
      throw new ForbiddenException('Only the person who logged the entry can modify it');
    }
    return entry;
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

  @Patch(':communicationId')
  @ResourceScope('membership.guest', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
    @Param('communicationId', uuidPipe) communicationId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(updateGuestCommunicationRequestSchema))
    body: UpdateGuestCommunicationRequest,
  ): Promise<GuestCommunication> {
    await this.assertGuestInClub(clubUnitId, guestId);
    await this.findOwnEntry(guestId, communicationId, principal.userId);
    return this.communications.update(communicationId, body);
  }

  @Delete(':communicationId')
  @HttpCode(204)
  @ResourceScope('membership.guest', 'delete', { source: 'param', key: 'clubUnitId' })
  async remove(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
    @Param('communicationId', uuidPipe) communicationId: string,
    @CurrentUser() principal: Principal,
  ): Promise<void> {
    await this.assertGuestInClub(clubUnitId, guestId);
    await this.findOwnEntry(guestId, communicationId, principal.userId);
    await this.communications.remove(communicationId);
  }
}
