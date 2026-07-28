import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { UnitPolicyGrant } from '@toastmasters/contracts';
import { canDelegate } from '../../common/authz/can-delegate';
import type { Action, Condition } from '../../common/authz/authz.types';
import { AccessRepository } from './access.repository';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

type PersonGrantRow = Awaited<ReturnType<PrismaClient['personGrant']['create']>>;
type UnitPolicyGrantRow = Awaited<ReturnType<PrismaClient['unitPolicyGrant']['create']>>;
type PlatformRoleAssignmentRow = Awaited<
  ReturnType<PrismaClient['platformRoleAssignment']['create']>
>;

function toUnitPolicyGrant(row: UnitPolicyGrantRow): UnitPolicyGrant {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    subjectRole: row.subjectRole ?? '',
    resource: row.resource,
    action: row.action,
    condition: row.condition,
    effect: row.effect,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

@Injectable()
export class GrantAdminRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly accessRepository: AccessRepository = new AccessRepository(),
  ) {}

  /** rbac-design.md §7.4/§12: the one guard every grant-creation path needs, or invitations carrying roles become an escalation route. */
  async grantPersonGrant(input: {
    actorId: string;
    personId: string;
    orgUnitId: string;
    resource: string;
    action: Action;
    condition?: Condition;
    reason: string;
    expiresAt?: Date | null;
  }): Promise<PersonGrantRow> {
    const [actorGrants, scope] = await Promise.all([
      this.accessRepository.effectiveGrants(input.actorId),
      this.accessRepository.pathOf(input.orgUnitId),
    ]);
    if (!canDelegate(actorGrants, { resource: input.resource, action: input.action, scope })) {
      throw new ForbiddenException(
        `${input.actorId} cannot delegate ${input.resource}:${input.action} — does not hold it at this scope`,
      );
    }
    return this.db.$transaction(async (tx) => {
      const grant = await tx.personGrant.create({
        data: {
          personId: input.personId,
          orgUnitId: input.orgUnitId,
          resource: input.resource,
          action: input.action,
          condition: input.condition ?? 'any',
          effect: 'allow',
          grantedBy: input.actorId,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPersonId: input.actorId,
          type: 'person_grant_created',
          resource: input.resource,
          action: input.action,
          orgUnitId: input.orgUnitId,
          reason: input.reason,
          metadata: { personId: input.personId, personGrantId: grant.id },
        },
      });
      return grant;
    });
  }

  /**
   * docs/superpowers/specs/...-super-admin-design.md §6: break-glass is the
   * existing direct-grant mechanism, reused. Deliberately NOT canDelegate-
   * gated — system_admin holds no standing restricted-resource access by
   * design, so it would always fail that check. Gated instead on actually
   * holding the system_admin platform role. Mints the grant and audits the
   * mint atomically.
   */
  async mintBreakGlass(input: {
    systemAdminPersonId: string;
    orgUnitId: string;
    resource: string;
    action: Action;
    reason: string;
    expiresAt?: Date;
  }): Promise<PersonGrantRow> {
    const isSystemAdmin = await this.db.platformRoleAssignment.findFirst({
      where: { personId: input.systemAdminPersonId, role: 'system_admin' },
    });
    if (!isSystemAdmin) {
      throw new ForbiddenException('Only system_admin may mint break-glass access');
    }

    return this.db.$transaction(async (tx) => {
      const grant = await tx.personGrant.create({
        data: {
          personId: input.systemAdminPersonId,
          orgUnitId: input.orgUnitId,
          resource: input.resource,
          action: input.action,
          condition: 'any',
          effect: 'allow',
          grantedBy: input.systemAdminPersonId,
          reason: input.reason,
          expiresAt: input.expiresAt ?? new Date(Date.now() + FIFTEEN_MINUTES_MS),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPersonId: input.systemAdminPersonId,
          type: 'break_glass_mint',
          resource: input.resource,
          action: input.action,
          orgUnitId: input.orgUnitId,
          reason: input.reason,
        },
      });
      return grant;
    });
  }

  /**
   * Prisma-only — no canDelegate check here. M2 Slice 3's UnitPolicyService
   * gates callers (allow overrides require canDelegate; deny overrides are
   * exempt; a last-unit_admin guard applies to self-deny), mirroring the
   * service-layer placement InvitationService/OrgUnitService already use.
   */
  async createUnitPolicyGrant(input: {
    orgUnitId: string;
    subjectRole: string;
    resource: string;
    action: Action;
    effect: 'allow' | 'deny';
    createdBy: string;
    reason: string;
    expiresAt?: Date | null;
  }): Promise<UnitPolicyGrant> {
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.unitPolicyGrant.create({
        data: {
          orgUnitId: input.orgUnitId,
          subjectKind: 'role',
          subjectRole: input.subjectRole,
          resource: input.resource,
          action: input.action,
          condition: 'any',
          effect: input.effect,
          createdBy: input.createdBy,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPersonId: input.createdBy,
          type: 'unit_policy_grant_created',
          resource: input.resource,
          action: input.action,
          orgUnitId: input.orgUnitId,
          reason: input.reason,
          metadata: {
            subjectRole: input.subjectRole,
            effect: input.effect,
            unitPolicyGrantId: created.id,
          },
        },
      });
      return created;
    });
    return toUnitPolicyGrant(row);
  }

  async grantPlatformRole(input: {
    personId: string;
    role: string;
    orgUnitId: string | null;
    grantedBy: string;
    expiresAt?: Date | null;
  }): Promise<PlatformRoleAssignmentRow> {
    return this.db.$transaction(async (tx) => {
      const created = await tx.platformRoleAssignment.create({
        data: {
          personId: input.personId,
          role: input.role,
          orgUnitId: input.orgUnitId,
          grantedBy: input.grantedBy,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorPersonId: input.grantedBy,
          type: 'platform_role_granted',
          orgUnitId: input.orgUnitId,
          metadata: {
            personId: input.personId,
            role: input.role,
            platformRoleAssignmentId: created.id,
          },
        },
      });
      return created;
    });
  }

  /**
   * rbac-design.md §7.2/§7.4: cannot remove the last unit_admin for a unit —
   * platform_role_assignment has no status/history field (unlike
   * role_assignment), so "revoke" is a hard delete here; that's acceptable
   * given how rare platform-role changes are meant to be (§6 table).
   */
  async revokePlatformRole(id: string, actorId: string): Promise<void> {
    const target = await this.db.platformRoleAssignment.findUnique({ where: { id } });
    if (!target) return;

    if (target.role === 'unit_admin' && target.orgUnitId) {
      const remaining = await this.db.platformRoleAssignment.count({
        where: {
          role: 'unit_admin',
          orgUnitId: target.orgUnitId,
          id: { not: id },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (remaining === 0) {
        throw new ForbiddenException('Cannot remove the last unit_admin for this unit');
      }
    }

    await this.db.$transaction(async (tx) => {
      await tx.platformRoleAssignment.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          actorPersonId: actorId,
          type: 'platform_role_revoked',
          orgUnitId: target.orgUnitId,
          metadata: { personId: target.personId, role: target.role, platformRoleAssignmentId: id },
        },
      });
    });
  }

  /** Same row-count invariant as revokePlatformRole's guard — reused by UnitPolicyService's last-admin check on self-deny. */
  async countActiveUnitAdmins(orgUnitId: string): Promise<number> {
    return this.db.platformRoleAssignment.count({
      where: {
        role: 'unit_admin',
        orgUnitId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }
}
