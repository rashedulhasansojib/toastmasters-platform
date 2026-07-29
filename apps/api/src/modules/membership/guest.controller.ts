import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createGuestRequestSchema,
  updateGuestRequestSchema,
  type CreateGuestRequest,
  type UpdateGuestRequest,
  type Guest,
  type ConvertGuestResponse,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { GuestService } from './guest.service';
import { GuestConversionService } from './guest-conversion.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 1: the guest pipeline. Club-scoped in the URL, matching every meeting-module controller's precedent. */
@Controller('clubs/:clubUnitId/guests')
export class GuestController {
  constructor(
    private readonly guests: GuestService,
    private readonly conversion: GuestConversionService,
  ) {}

  private async assertGuestInClub(clubUnitId: string, guestId: string): Promise<Guest> {
    const guest = await this.guests.findById(guestId);
    if (!guest || guest.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Guest not found');
    }
    return guest;
  }

  @Post()
  @ResourceScope('membership.guest', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createGuestRequestSchema)) body: CreateGuestRequest,
  ): Promise<Guest> {
    return this.guests.create({ ...body, orgUnitId: clubUnitId, createdBy: principal.userId });
  }

  @Get()
  @ResourceScope('membership.guest', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<Guest[]> {
    return this.guests.list(clubUnitId);
  }

  @Get(':guestId')
  @ResourceScope('membership.guest', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
  ): Promise<Guest> {
    return this.assertGuestInClub(clubUnitId, guestId);
  }

  @Patch(':guestId')
  @ResourceScope('membership.guest', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
    @Body(new ZodValidationPipe(updateGuestRequestSchema)) body: UpdateGuestRequest,
  ): Promise<Guest> {
    await this.assertGuestInClub(clubUnitId, guestId);
    return this.guests.update(guestId, body);
  }

  /** M4 Slice 4: create-or-attach conversion. Reuses `membership.guest:update` — no new resource. */
  @Post(':guestId/convert')
  @ResourceScope('membership.guest', 'update', { source: 'param', key: 'clubUnitId' })
  async convert(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('guestId', uuidPipe) guestId: string,
  ): Promise<ConvertGuestResponse> {
    await this.assertGuestInClub(clubUnitId, guestId);
    return this.conversion.convert(guestId);
  }
}
