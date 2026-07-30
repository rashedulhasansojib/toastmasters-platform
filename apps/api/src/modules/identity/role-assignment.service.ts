import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClubMemberType,
  CreateRoleAssignmentResponse,
  RoleAssignmentEndedReason,
} from '@toastmasters/contracts';
import { canDelegate } from '../../common/authz/can-delegate';
import { AccessRepository } from '../access/access.repository';
import { OrgUnitRepository } from '../org/org.repository';
import { ClubMembershipRepository } from './club-membership.repository';
import { RoleAssignmentRepository } from './role-assignment.repository';
import { RoleTemplateRepository } from './role-template.repository';

const DIRECTOR_TIERS = new Set(['area', 'division', 'district']);

/**
 * Users admin: the tier-agnostic "assign this person to this role at this
 * unit" path (`POST org-units/:orgUnitId/role-assignments`), distinct from
 * the pre-existing club-scoped `POST clubs/:clubUnitId/role-assignments`
 * (identity.controller.ts), which is left calling RoleAssignmentRepository
 * directly and unchanged — refactoring it to require `memberType` would be a
 * behavior change for existing callers, not just a new capability.
 */
@Injectable()
export class RoleAssignmentService {
  constructor(
    private readonly roleAssignments: RoleAssignmentRepository,
    private readonly roleTemplates: RoleTemplateRepository,
    private readonly orgUnits: OrgUnitRepository,
    private readonly clubMemberships: ClubMembershipRepository,
    private readonly accessRepository: AccessRepository,
  ) {}

  async assign(input: {
    actorId: string;
    personId: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    termStart: Date;
    termEnd: Date;
    memberType?: ClubMemberType;
  }): Promise<CreateRoleAssignmentResponse> {
    const [orgUnit, template] = await Promise.all([
      this.orgUnits.findById(input.orgUnitId),
      this.roleTemplates.findByRole(input.role),
    ]);
    if (!orgUnit) throw new NotFoundException('Org unit not found');
    if (!template) throw new BadRequestException(`Unknown role "${input.role}"`);
    if (template.unitTypes.length > 0 && !template.unitTypes.includes(orgUnit.type)) {
      throw new BadRequestException(
        `${template.label} is a ${template.tier}-tier role and cannot be assigned at a ${orgUnit.type}`,
      );
    }
    if (orgUnit.type === 'club' && !input.memberType) {
      throw new BadRequestException('memberType is required when assigning a club-tier role');
    }

    const roleAssignment = await this.roleAssignments.assign({
      personId: input.personId,
      orgUnitId: input.orgUnitId,
      role: input.role,
      programYearId: input.programYearId,
      termStart: input.termStart,
      termEnd: input.termEnd,
      appointedBy: input.actorId,
      memberType: input.memberType,
    });

    // system-design.md §6.3 INVARIANT DirectorRequiresClubMembership: a
    // non-blocking warning, never a refusal — the appointment still happens.
    const warnings: string[] = [];
    if (DIRECTOR_TIERS.has(template.tier)) {
      const memberships = await this.clubMemberships.findByPerson(input.personId);
      const hasActiveMembership = memberships.some((m) => m.localStatus === 'active');
      if (!hasActiveMembership) {
        warnings.push(
          `${template.label} does not yet hold an active club membership — DirectorRequiresClubMembership is unmet.`,
        );
      }
    }

    return { roleAssignment, warnings };
  }

  /**
   * `:id` is a role-assignment id, not an org-unit id, so there is no
   * `@ResourceScope` on the route this backs — the authority check happens
   * here against the assignment's own org unit, same pattern as
   * InvitationService.create()'s inner canDelegate check.
   */
  async end(id: string, reason: RoleAssignmentEndedReason, actorId: string): Promise<void> {
    const target = await this.roleAssignments.findById(id);
    if (!target) throw new NotFoundException('Role assignment not found');

    const [actorGrants, scope] = await Promise.all([
      this.accessRepository.effectiveGrants(actorId),
      this.accessRepository.pathOf(target.orgUnitId),
    ]);
    if (
      !canDelegate(actorGrants, { resource: 'identity.role_assignment', action: 'update', scope })
    ) {
      throw new ForbiddenException(
        'Cannot end a role assignment you do not hold the authority over',
      );
    }

    await this.roleAssignments.end(id, reason, actorId);
  }
}
