import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  ClubMemberType,
  RoleAssignment,
  RoleAssignmentEndedReason,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type RoleAssignmentRow = Awaited<ReturnType<PrismaClient['roleAssignment']['create']>>;

/**
 * Turn the partial unique indexes on `role_assignment` into a 409 an admin can
 * act on. Without this the violation surfaced as a bare 500 with no `detail`,
 * so the Users page showed only "Could not assign that role" and gave no clue
 * that someone already held it.
 */
function translateAssignConflict(error: unknown, role: string, roleLabel?: string): unknown {
  const code = (error as { code?: string })?.code;
  if (code !== 'P2002') return error;
  const target = String((error as { meta?: { target?: unknown } })?.meta?.target ?? '');
  const label = roleLabel ?? role;
  if (target.includes('no_duplicate')) {
    return new ConflictException(`That person already holds ${label} here for this program year.`);
  }
  return new ConflictException(
    `${label} is a single-holder role and is already filled for this program year. End the current holder's term first.`,
  );
}

function toRoleAssignment(row: RoleAssignmentRow): RoleAssignment {
  return {
    id: row.id,
    personId: row.personId,
    orgUnitId: row.orgUnitId,
    role: row.role,
    programYearId: row.programYearId,
    termStart: row.termStart.toISOString().slice(0, 10),
    termEnd: row.termEnd.toISOString().slice(0, 10),
    status: row.status,
    appointedBy: row.appointedBy,
    appointedAt: row.appointedAt.toISOString(),
    trainedAt: (row.trainedAt as RoleAssignment['trainedAt']) ?? [],
    endedReason: row.endedReason,
  };
}

@Injectable()
export class RoleAssignmentRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Always creates status: 'active' — M1 has no pending-approval workflow.
   * `memberType` is optional and, when present, also upserts an active
   * ClubMembership for the same (person, orgUnit) pair in the same
   * transaction — the Users admin page's "assign role + ensure membership"
   * behavior, so a person assigned into a club immediately counts toward
   * that club's member total (the same ClubMembership rows the org-tree
   * browser's counts already read).
   */
  async assign(input: {
    personId: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    termStart: Date;
    termEnd: Date;
    appointedBy: string;
    memberType?: ClubMemberType;
    /** From the role template. Defaults false so the legacy club-scoped caller keeps working. */
    isSingleton?: boolean;
    /** Only for the conflict message; the repository never branches on it. */
    roleLabel?: string;
  }): Promise<RoleAssignment> {
    try {
      return await this.assignInTransaction(input);
    } catch (error) {
      throw translateAssignConflict(error, input.role, input.roleLabel);
    }
  }

  private async assignInTransaction(input: {
    personId: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    termStart: Date;
    termEnd: Date;
    appointedBy: string;
    memberType?: ClubMemberType;
    isSingleton?: boolean;
  }): Promise<RoleAssignment> {
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.roleAssignment.create({
        data: {
          personId: input.personId,
          orgUnitId: input.orgUnitId,
          role: input.role,
          programYearId: input.programYearId,
          termStart: input.termStart,
          termEnd: input.termEnd,
          status: 'active',
          appointedBy: input.appointedBy,
          trainedAt: [],
          isSingleton: input.isSingleton ?? false,
        },
      });

      if (input.memberType) {
        const existing = await tx.clubMembership.findFirst({
          where: { personId: input.personId, clubUnitId: input.orgUnitId },
        });
        if (existing) {
          await tx.clubMembership.update({
            where: { id: existing.id },
            data: { memberType: input.memberType, localStatus: 'active', leftAt: null },
          });
        } else {
          await tx.clubMembership.create({
            data: {
              personId: input.personId,
              clubUnitId: input.orgUnitId,
              memberType: input.memberType,
            },
          });
        }
      }

      // rbac-design.md §5: role assignment created/ended bumps permission_version.
      await tx.person.update({
        where: { id: input.personId },
        data: { permissionVersion: { increment: 1 } },
      });
      // CLAUDE.md §1: "every grant change goes through the audited surface."
      await tx.auditEvent.create({
        data: {
          actorPersonId: input.appointedBy,
          type: 'role_assignment_created',
          orgUnitId: input.orgUnitId,
          metadata: { personId: input.personId, role: input.role, roleAssignmentId: created.id },
        },
      });
      return created;
    });
    return toRoleAssignment(row);
  }

  /** Ended assignments are retained as history, never deleted. */
  async end(id: string, reason: RoleAssignmentEndedReason, actorId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.roleAssignment.update({
        where: { id },
        data: { status: 'ended', endedReason: reason },
      });
      await tx.person.update({
        where: { id: updated.personId },
        data: { permissionVersion: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          actorPersonId: actorId,
          type: 'role_assignment_ended',
          orgUnitId: updated.orgUnitId,
          reason,
          metadata: { personId: updated.personId, role: updated.role, roleAssignmentId: id },
        },
      });
    });
  }

  async findById(id: string): Promise<RoleAssignment | null> {
    const row = await this.db.roleAssignment.findUnique({ where: { id } });
    return row ? toRoleAssignment(row) : null;
  }

  async findActiveForUnit(orgUnitId: string, role?: string): Promise<RoleAssignment[]> {
    const rows = await this.db.roleAssignment.findMany({
      where: { orgUnitId, status: 'active', ...(role ? { role } : {}) },
    });
    return rows.map(toRoleAssignment);
  }

  /**
   * The caller's own active roles in one club — backs the VP Membership
   * dashboard's landing redirect (CLAUDE.md §2 decision 11). No
   * `@ResourceScope` needed at the controller: it's the caller's own data,
   * same reasoning as `/auth/me`.
   */
  async findActiveByPersonAndUnit(personId: string, orgUnitId: string): Promise<RoleAssignment[]> {
    const rows = await this.db.roleAssignment.findMany({
      where: { personId, orgUnitId, status: 'active' },
    });
    return rows.map(toRoleAssignment);
  }

  /** The unit switcher's candidate list (Slice 6) — places actually appointed, not a scope-prefix walk. */
  async findActiveOrgUnitIdsForPerson(personId: string): Promise<string[]> {
    const rows = await this.db.roleAssignment.findMany({
      where: { personId, status: 'active' },
      select: { orgUnitId: true },
      distinct: ['orgUnitId'],
    });
    return rows.map((r) => r.orgUnitId);
  }
}
