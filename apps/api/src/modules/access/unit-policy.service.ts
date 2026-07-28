import { ForbiddenException, Injectable } from '@nestjs/common';
import type { UnitPolicyGrant } from '@toastmasters/contracts';
import { canDelegate } from '../../common/authz/can-delegate';
import type { Action } from '../../common/authz/authz.types';
import { AccessRepository } from './access.repository';
import { GrantAdminRepository } from './grant-admin.repository';

/**
 * M2 Slice 3: FR-AUTHZ-9/10. `allow` overrides are canDelegate-gated the
 * same way every other grant-creation path is — or a unit_admin could
 * retune a unit beyond what they themselves hold. `deny` overrides are
 * exempt: they only remove access, so they cannot be an escalation route
 * (see the Slice 3 plan's design note). The last-unit_admin guard is scoped
 * narrowly to a self-deny of the one capability this slice creates —
 * access.unit_policy:create for the unit_admin role itself — mirroring
 * GrantAdminRepository.revokePlatformRole's existing, equally narrow check.
 */
@Injectable()
export class UnitPolicyService {
  constructor(
    private readonly grantAdmin: GrantAdminRepository,
    private readonly accessRepository: AccessRepository,
  ) {}

  async create(input: {
    actorId: string;
    orgUnitId: string;
    subjectRole: string;
    resource: string;
    action: Action;
    effect: 'allow' | 'deny';
    reason: string;
    expiresAt?: Date | null;
  }): Promise<UnitPolicyGrant> {
    if (input.effect === 'allow') {
      const [actorGrants, scope] = await Promise.all([
        this.accessRepository.effectiveGrants(input.actorId),
        this.accessRepository.pathOf(input.orgUnitId),
      ]);
      if (!canDelegate(actorGrants, { resource: input.resource, action: input.action, scope })) {
        throw new ForbiddenException(
          'Cannot grant what you do not hold — the override would exceed your own access',
        );
      }
    }

    if (
      input.effect === 'deny' &&
      input.subjectRole === 'unit_admin' &&
      input.resource === 'access.unit_policy' &&
      input.action === 'create'
    ) {
      const remaining = await this.grantAdmin.countActiveUnitAdmins(input.orgUnitId);
      if (remaining <= 1) {
        throw new ForbiddenException('Cannot remove the last unit_admin for this unit');
      }
    }

    return this.grantAdmin.createUnitPolicyGrant({
      orgUnitId: input.orgUnitId,
      subjectRole: input.subjectRole,
      resource: input.resource,
      action: input.action,
      effect: input.effect,
      createdBy: input.actorId,
      reason: input.reason,
      expiresAt: input.expiresAt,
    });
  }
}
