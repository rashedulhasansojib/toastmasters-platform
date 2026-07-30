import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ClubMemberType, Invitation } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type InvitationRow = Awaited<ReturnType<PrismaClient['invitation']['create']>>;

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    orgUnitId: row.orgUnitId,
    role: row.role,
    memberType: row.memberType,
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
    memberType?: ClubMemberType;
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
        memberType: input.memberType ?? null,
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

  async findById(id: string): Promise<Invitation | null> {
    const row = await this.db.invitation.findUnique({ where: { id } });
    return row ? toInvitation(row) : null;
  }

  /** Users admin's "pending invitations" column — one subtree-scoped query. */
  async findPendingBySubtree(subtreePath: string): Promise<Invitation[]> {
    // $queryRaw does not apply Prisma's camelCase field mapping — every
    // column toInvitation() reads back is aliased explicitly.
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        email: string;
        orgUnitId: string;
        role: string;
        memberType: string | null;
        programYearId: string;
        invitedBy: string;
        status: Invitation['status'];
        expiresAt: Date;
        createdAt: Date;
        acceptedAt: Date | null;
        acceptedPersonId: string | null;
      }>
    >`
      SELECT i.id, i.email, i.org_unit_id AS "orgUnitId", i.role, i.member_type AS "memberType",
             i.program_year_id AS "programYearId", i.invited_by AS "invitedBy", i.status,
             i.expires_at AS "expiresAt", i.created_at AS "createdAt",
             i.accepted_at AS "acceptedAt", i.accepted_person_id AS "acceptedPersonId"
      FROM invitation i
      JOIN org_unit ou ON ou.id = i.org_unit_id
      WHERE i.status = 'pending'::"InvitationStatus" AND ou.path <@ ${subtreePath}::ltree
      ORDER BY i.created_at DESC
    `;
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      orgUnitId: row.orgUnitId,
      role: row.role,
      memberType: row.memberType as Invitation['memberType'],
      programYearId: row.programYearId,
      invitedBy: row.invitedBy,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      acceptedPersonId: row.acceptedPersonId,
    }));
  }

  /**
   * Re-mints the token/expiry on the same row — the previous raw token stops
   * resolving the instant this commits, since only the current hash is ever
   * looked up. Only a still-pending invitation can be resent.
   */
  async resend(id: string, tokenHash: string, expiresAt: Date): Promise<Invitation> {
    const existing = await this.db.invitation.findUnique({ where: { id } });
    if (!existing || existing.status !== 'pending') {
      throw new ForbiddenException('Only a pending invitation can be resent');
    }
    const row = await this.db.invitation.update({
      where: { id },
      data: { tokenHash, expiresAt },
    });
    return toInvitation(row);
  }

  async revoke(id: string): Promise<Invitation> {
    const row = await this.db.invitation.update({ where: { id }, data: { status: 'revoked' } });
    return toInvitation(row);
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

      if (invitation.memberType) {
        const existingMembership = await tx.clubMembership.findFirst({
          where: { personId: person.id, clubUnitId: invitation.orgUnitId },
        });
        if (existingMembership) {
          await tx.clubMembership.update({
            where: { id: existingMembership.id },
            data: { memberType: invitation.memberType, localStatus: 'active', leftAt: null },
          });
        } else {
          await tx.clubMembership.create({
            data: {
              personId: person.id,
              clubUnitId: invitation.orgUnitId,
              memberType: invitation.memberType,
            },
          });
        }
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date(), acceptedPersonId: person.id },
      });

      return { personId: person.id };
    });
  }
}
