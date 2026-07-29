import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { ConvertGuestResponse } from '@toastmasters/contracts';
import { PersonRepository } from '../identity/person.repository';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { GuestRepository } from './guest.repository';

/**
 * M4 Slice 4: system-design.md §11.1/§21.2 — "create-or-attach `Person` →
 * create `ClubMembership` → link." A guest whose email already matches an
 * existing `Person` is attached (dual membership, §6.2) rather than given a
 * second identity; a brand-new email mints a new `Person`.
 */
@Injectable()
export class GuestConversionService {
  constructor(
    private readonly guests: GuestRepository,
    private readonly people: PersonRepository,
    private readonly clubMemberships: ClubMembershipRepository,
  ) {}

  async convert(guestId: string): Promise<ConvertGuestResponse> {
    const guest = await this.guests.findById(guestId);
    if (!guest) {
      throw new BadRequestException('Guest not found');
    }
    if (guest.pipelineStatus === 'joined') {
      throw new ConflictException('Guest has already converted');
    }
    if (!guest.email) {
      throw new BadRequestException('Guest needs an email on file to convert');
    }

    const existingPerson = await this.people.findByEmail(guest.email);
    const wasExistingPerson = existingPerson !== null;
    const person =
      existingPerson ??
      (await this.people.create({
        email: guest.email,
        fullName: guest.fullName,
        phone: guest.phone ?? undefined,
      }));

    const existingMemberships = await this.clubMemberships.findByPerson(person.id);
    const clubMembership =
      existingMemberships.find((m) => m.clubUnitId === guest.orgUnitId && !m.leftAt) ??
      (await this.clubMemberships.create({
        personId: person.id,
        clubUnitId: guest.orgUnitId,
        memberType: wasExistingPerson ? 'dual' : 'new',
        isPrimary: existingMemberships.length === 0,
      }));

    const converted = await this.guests.markConverted(guestId, person.id);
    return { guest: converted, person, clubMembership, wasExistingPerson };
  }
}
