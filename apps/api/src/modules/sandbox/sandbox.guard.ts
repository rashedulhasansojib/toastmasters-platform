import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RoleAssignmentRepository } from '../identity/role-assignment.repository';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { GrantAdminRepository } from '../access/grant-admin.repository';
import type { Principal } from '../../common/authz/authz.types';

interface RequestLike {
  user?: Principal;
}

/**
 * Sandbox routes are authentication-only, not resource-scoped — there is no
 * org unit to authorize against, so `@ResourceScope`/`authorize()` don't
 * apply here (same "authentication-only route" shape as auth.controller's
 * `me`/`switchable-units`). This guard is the real gate instead: only a
 * person with zero org-tree footprint — no active club membership, role
 * assignment, or platform role — may reach the sandbox, so a real officer
 * can never land on fixture data meant for a demo signup.
 */
@Injectable()
export class SandboxGuard implements CanActivate {
  constructor(
    private readonly roleAssignments: RoleAssignmentRepository,
    private readonly clubMemberships: ClubMembershipRepository,
    private readonly grantAdmin: GrantAdminRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const principal = request.user;
    if (!principal) throw new ForbiddenException('No authenticated principal');

    const [roleUnitIds, platformUnitIds, memberships] = await Promise.all([
      this.roleAssignments.findActiveOrgUnitIdsForPerson(principal.userId),
      this.grantAdmin.findPlatformRoleOrgUnitIdsForPerson(principal.userId),
      this.clubMemberships.findByPerson(principal.userId),
    ]);
    const hasFootprint =
      roleUnitIds.length > 0 || platformUnitIds.length > 0 || memberships.some((m) => !m.leftAt);
    if (hasFootprint) {
      throw new ForbiddenException('Sandbox is only available to accounts with no club assignment');
    }
    return true;
  }
}
