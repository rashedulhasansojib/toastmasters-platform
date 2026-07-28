import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { RoleAssignment, RoleAssignmentEndedReason } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type RoleAssignmentRow = Awaited<ReturnType<PrismaClient['roleAssignment']['create']>>;

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

  /** Always creates status: 'active' — M1 has no pending-approval workflow. */
  async assign(input: {
    personId: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    termStart: Date;
    termEnd: Date;
    appointedBy: string;
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
        },
      });
      // rbac-design.md §5: role assignment created/ended bumps permission_version.
      await tx.person.update({
        where: { id: input.personId },
        data: { permissionVersion: { increment: 1 } },
      });
      return created;
    });
    return toRoleAssignment(row);
  }

  /** Ended assignments are retained as history, never deleted. */
  async end(id: string, reason: RoleAssignmentEndedReason): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.roleAssignment.update({
        where: { id },
        data: { status: 'ended', endedReason: reason },
      });
      await tx.person.update({
        where: { id: updated.personId },
        data: { permissionVersion: { increment: 1 } },
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
}
