import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Guest, PublicGuestRegistrationRequest } from '@toastmasters/contracts';
import { MeetingRepository } from '../meeting/meeting.repository';
import { CapabilityTokenService } from '../meeting/capability-token.service';
import { GuestRepository } from './guest.repository';
import { computeDeleteAfter } from './guest.service';

/**
 * M4 Slice 10: the guest-join form behind a `guest_register` capability
 * token — CLAUDE.md §1's single guest-interaction primitive, not a bare
 * public `clubUnitId` write. `Guest.createdBy` (NOT NULL — every guest
 * traces to an accountable person) is attributed to the officer who issued
 * the token, since the actual submitter has no `Person` row.
 */
@Injectable()
export class PublicGuestRegistrationService {
  constructor(
    private readonly tokens: CapabilityTokenService,
    private readonly meetings: MeetingRepository,
    private readonly guests: GuestRepository,
  ) {}

  async register(rawToken: string, input: PublicGuestRegistrationRequest): Promise<Guest> {
    const token = await this.tokens.findValid(rawToken);
    if (!token) {
      throw new NotFoundException('Invalid or expired token');
    }
    if (token.purpose !== 'guest_register') {
      throw new BadRequestException('This token is not valid for guest registration');
    }
    const meeting = await this.meetings.findById(token.meetingId);
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return this.guests.create({
      orgUnitId: meeting.clubUnitId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      whatsapp: input.whatsapp,
      leadSource: 'public_guest_form',
      deleteAfter: computeDeleteAfter(new Date()),
      createdBy: token.createdBy,
    });
  }
}
