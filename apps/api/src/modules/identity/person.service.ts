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
import { PasswordService } from '../../common/auth/password.service';
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
    private readonly passwords: PasswordService,
  ) {}

  async search(input: {
    anchorOrgUnitId: string;
    q?: string;
    limit: number;
    offset: number;
    includeDeleted?: boolean;
  }): Promise<PersonSearchResponse> {
    const anchor = await this.orgUnits.findById(input.anchorOrgUnitId);
    if (!anchor) throw new NotFoundException('Org unit not found');

    const { items, total } = await this.people.search({
      subtreePath: anchor.path,
      isRegionRoot: anchor.type === 'region',
      q: input.q,
      limit: input.limit,
      offset: input.offset,
      includeDeleted: input.includeDeleted,
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
    await this.assertVisible(personId, anchorOrgUnitId);
    return this.people.update(personId, changes);
  }

  /**
   * Users admin password reset (super-admin People page). Same anchor +
   * subtree + not-deleted check as update(). Argon2id hashing happens here,
   * once, so the repo never sees a plaintext (matching CLAUDE.md §6
   * "Never bcrypt" and the single-place hashing convention).
   */
  async setPassword(
    personId: string,
    anchorOrgUnitId: string,
    password: string,
    actorId: string,
  ): Promise<void> {
    await this.assertVisible(personId, anchorOrgUnitId);
    const hash = await this.passwords.hash(password);
    await this.people.setPassword(personId, hash, actorId);
  }

  /**
   * Users admin soft-delete (super-admin People page). Same anchor +
   * subtree + not-deleted check as update(). The rest of the transaction
   * (ending role assignments, deactivating memberships, revoking pending
   * invitations, marking the row deleted, bumping permissionVersion,
   * writing the audit row) lives in the repository as one commit — see
   * PersonRepository.softDelete.
   */
  async softDelete(personId: string, anchorOrgUnitId: string, actorId: string): Promise<void> {
    const target = await this.assertVisible(personId, anchorOrgUnitId);
    await this.people.softDelete(personId, target.email, actorId);
  }

  /**
   * Users admin "show disabled accounts" toggle's restore action. Same
   * anchor + subtree check as getDetail() — not assertVisible(), which
   * requires findById() to succeed and findById() excludes deleted people by
   * design; the whole point here is reaching a person who is currently
   * deleted.
   */
  async restore(personId: string, anchorOrgUnitId: string, actorId: string): Promise<Person> {
    const anchor = await this.orgUnits.findById(anchorOrgUnitId);
    if (!anchor) throw new NotFoundException('Org unit not found');

    if (anchor.type !== 'region' && !(await this.people.isWithinSubtree(personId, anchor.path))) {
      throw new NotFoundException('Person not found');
    }
    return this.people.restore(personId, actorId);
  }

  /**
   * Shared 404-hide for detail/update/setPassword/softDelete: the outer
   * @ResourceScope only checked the actor at the anchor; the target person
   * id must additionally be in the anchor's subtree AND not already
   * soft-deleted. Both branches return the same NotFoundException so the
   * response never leaks which condition failed.
   */
  private async assertVisible(personId: string, anchorOrgUnitId: string): Promise<Person> {
    const anchor = await this.orgUnits.findById(anchorOrgUnitId);
    if (!anchor) throw new NotFoundException('Org unit not found');

    if (anchor.type !== 'region' && !(await this.people.isWithinSubtree(personId, anchor.path))) {
      throw new NotFoundException('Person not found');
    }
    const person = await this.people.findById(personId);
    if (!person) throw new NotFoundException('Person not found');
    return person;
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
