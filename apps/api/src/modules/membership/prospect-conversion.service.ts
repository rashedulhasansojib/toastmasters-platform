import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { ConvertProspectResponse } from '@toastmasters/contracts';
import { PersonRepository } from '../identity/person.repository';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { ProspectRepository } from './prospect.repository';

/**
 * M4 Slice 4: system-design.md §11.1/§21.2 — "create-or-attach `Person` →
 * create `ClubMembership` → link." A prospect whose email already matches an
 * existing `Person` is attached (dual membership, §6.2) rather than given a
 * second identity; a brand-new email mints a new `Person`.
 */
@Injectable()
export class ProspectConversionService {
  constructor(
    private readonly prospects: ProspectRepository,
    private readonly people: PersonRepository,
    private readonly clubMemberships: ClubMembershipRepository,
  ) {}

  async convert(prospectId: string): Promise<ConvertProspectResponse> {
    const prospect = await this.prospects.findById(prospectId);
    if (!prospect) {
      throw new BadRequestException('Prospect not found');
    }
    if (prospect.pipelineStatus === 'joined') {
      throw new ConflictException('Prospect has already converted');
    }
    if (!prospect.email) {
      throw new BadRequestException('Prospect needs an email on file to convert');
    }

    const existingPerson = await this.people.findByEmail(prospect.email);
    const wasExistingPerson = existingPerson !== null;
    const person =
      existingPerson ??
      (await this.people.create({
        email: prospect.email,
        fullName: prospect.fullName,
        phone: prospect.phone ?? undefined,
      }));

    const existingMemberships = await this.clubMemberships.findByPerson(person.id);
    const clubMembership =
      existingMemberships.find((m) => m.clubUnitId === prospect.orgUnitId && !m.leftAt) ??
      (await this.clubMemberships.create({
        personId: person.id,
        clubUnitId: prospect.orgUnitId,
        memberType: wasExistingPerson ? 'dual' : 'new',
        isPrimary: existingMemberships.length === 0,
      }));

    const converted = await this.prospects.markConverted(prospectId, person.id);
    return { prospect: converted, person, clubMembership, wasExistingPerson };
  }
}
