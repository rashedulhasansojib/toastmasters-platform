import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Invitation } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type InvitationRow = Awaited<ReturnType<PrismaClient['invitation']['create']>>;

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    orgUnitId: row.orgUnitId,
    role: row.role,
    programYearId: row.programYearId,
    invitedBy: row.invitedBy,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedPersonId: row.acceptedPersonId,
  };
}

@Injectable()
export class InvitationRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    email: string;
    tokenHash: string;
    orgUnitId: string;
    role: string;
    programYearId: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<Invitation> {
    const row = await this.db.invitation.create({
      data: {
        email: input.email.toLowerCase(),
        tokenHash: input.tokenHash,
        orgUnitId: input.orgUnitId,
        role: input.role,
        programYearId: input.programYearId,
        invitedBy: input.invitedBy,
        expiresAt: input.expiresAt,
      },
    });
    return toInvitation(row);
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const row = await this.db.invitation.findUnique({ where: { tokenHash } });
    return row ? toInvitation(row) : null;
  }

  /**
   * Atomic: re-validates status/expiry against a fresh read (never trusts a
   * pre-transaction check across an await boundary), creates-or-attaches the
   * Person, sets credentials only if none held, creates the RoleAssignment,
   * bumps permission_version, marks the invitation accepted.
   */
  async accept(input: {
    tokenHash: string;
    fullName: string;
    passwordHash: string;
    termStart: Date;
    termEnd: Date;
  }): Promise<{ personId: string }> {
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { tokenHash: input.tokenHash } });
      if (!invitation || invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired invitation');
      }

      let person = await tx.person.findUnique({ where: { email: invitation.email } });
      if (!person) {
        person = await tx.person.create({
          data: {
            email: invitation.email,
            fullName: input.fullName,
            passwordHash: input.passwordHash,
            status: 'active',
          },
        });
      } else if (!person.passwordHash) {
        person = await tx.person.update({
          where: { id: person.id },
          data: { passwordHash: input.passwordHash, status: 'active' },
        });
      }

      const roleAssignment = await tx.roleAssignment.create({
        data: {
          personId: person.id,
          orgUnitId: invitation.orgUnitId,
          role: invitation.role,
          programYearId: invitation.programYearId,
          termStart: input.termStart,
          termEnd: input.termEnd,
          status: 'active',
          appointedBy: invitation.invitedBy,
          trainedAt: [],
        },
      });
      await tx.person.update({
        where: { id: person.id },
        data: { permissionVersion: { increment: 1 } },
      });
      // CLAUDE.md §1: attributed to the inviter — they authorized the role,
      // not the person accepting it.
      await tx.auditEvent.create({
        data: {
          actorPersonId: invitation.invitedBy,
          type: 'role_assignment_created',
          orgUnitId: invitation.orgUnitId,
          metadata: {
            personId: person.id,
            role: invitation.role,
            roleAssignmentId: roleAssignment.id,
            viaInvitationId: invitation.id,
          },
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date(), acceptedPersonId: person.id },
      });

      return { personId: person.id };
    });
  }
}
