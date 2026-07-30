import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePersonRequest,
  InvitationWithLink,
  OrgUnitAncestorsResponse,
  Person,
  PersonDetail,
  PersonSearchResponse,
  UpdatePersonRequest,
} from '@toastmasters/contracts';
import { OrgUnitRepository } from '../org/org.repository';
import { InvitationService } from './invitation.service';
import { PersonRepository } from './person.repository';

/**
 * Users admin (super-admin People page). `anchorOrgUnitId` is the org unit
 * the route's @ResourceScope already authorized the actor against — it
 * anchors the subtree search()/isWithinSubtree() filter to, exactly as
 * PlatformConsoleService's routes anchor on `regionUnitId`.
 */
@Injectable()
export class PersonService {
  constructor(
    private readonly people: PersonRepository,
    private readonly orgUnits: OrgUnitRepository,
    private readonly invitations: InvitationService,
  ) {}

  async search(input: {
    anchorOrgUnitId: string;
    q?: string;
    limit: number;
    offset: number;
  }): Promise<PersonSearchResponse> {
    const anchor = await this.orgUnits.findById(input.anchorOrgUnitId);
    if (!anchor) throw new NotFoundException('Org unit not found');

    const { items, total } = await this.people.search({
      subtreePath: anchor.path,
      isRegionRoot: anchor.type === 'region',
      q: input.q,
      limit: input.limit,
      offset: input.offset,
    });
    return { items, total, limit: input.limit, offset: input.offset };
  }

  async getDetail(personId: string, anchorOrgUnitId: string): Promise<PersonDetail> {
    const anchor = await this.orgUnits.findById(anchorOrgUnitId);
    if (!anchor) throw new NotFoundException('Org unit not found');

    if (anchor.type !== 'region' && !(await this.people.isWithinSubtree(personId, anchor.path))) {
      // 404, not 403 — a district-scoped unit_admin should not learn that a
      // person outside their subtree exists at all.
      throw new NotFoundException('Person not found');
    }

    const detail = await this.people.findDetail(personId);
    if (!detail) throw new NotFoundException('Person not found');
    return detail;
  }

  async update(
    personId: string,
    anchorOrgUnitId: string,
    changes: UpdatePersonRequest,
  ): Promise<Person> {
    const anchor = await this.orgUnits.findById(anchorOrgUnitId);
    if (!anchor) throw new NotFoundException('Org unit not found');

    if (anchor.type !== 'region' && !(await this.people.isWithinSubtree(personId, anchor.path))) {
      throw new NotFoundException('Person not found');
    }

    return this.people.update(personId, changes);
  }

  /**
   * Creates a bare Person, then optionally invites them into a role — the
   * two steps are not atomic (system-design.md §6.3: membership/role
   * assignment has no ordering dependency on the invite step). If the
   * invite step fails after the person is created, the Person row still
   * exists at `status: invited` with no pending invitation — a valid,
   * correctable state; the admin can send an invite later from the detail
   * page. `input.invite`'s own delegation check (InvitationService.create)
   * is independent of whatever `anchorOrgUnitId` the outer route resolved.
   */
  async createWithOptionalInvite(input: {
    actorId: string;
    request: CreatePersonRequest;
  }): Promise<{ person: Person; invitation: InvitationWithLink | null }> {
    const person = await this.people.create({
      email: input.request.email,
      fullName: input.request.fullName,
      phone: input.request.phone,
      tiMemberNumber: input.request.tiMemberNumber,
    });

    if (!input.request.invite) {
      return { person, invitation: null };
    }

    const invitation = await this.invitations.create({
      actorId: input.actorId,
      orgUnitId: input.request.invite.orgUnitId,
      email: person.email,
      role: input.request.invite.role,
      programYearId: input.request.invite.programYearId,
      memberType: input.request.invite.memberType,
    });

    return { person, invitation };
  }

  /** The cascade picker's "auto-populate the parents above the unit you picked" read. */
  async getAncestors(orgUnitId: string): Promise<OrgUnitAncestorsResponse> {
    const unit = await this.orgUnits.findById(orgUnitId);
    if (!unit) throw new NotFoundException('Org unit not found');
    const ancestors = await this.orgUnits.findAncestors(unit.path);
    return { unit, ancestors };
  }
}
