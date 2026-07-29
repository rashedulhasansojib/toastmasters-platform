import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ClubMemberSummary, ClubMembership, ClubMemberType } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ClubMembershipRow = Awaited<ReturnType<PrismaClient['clubMembership']['create']>>;

function toClubMembership(row: ClubMembershipRow): ClubMembership {
  return {
    id: row.id,
    personId: row.personId,
    clubUnitId: row.clubUnitId,
    memberType: row.memberType,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt?.toISOString() ?? null,
    isPrimary: row.isPrimary,
    tiStanding: row.tiStanding,
    localStatus: row.localStatus,
    provenance: row.provenance,
    lastReconciledAt: row.lastReconciledAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ClubMembershipRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    personId: string;
    clubUnitId: string;
    memberType: ClubMemberType;
    isPrimary?: boolean;
  }): Promise<ClubMembership> {
    const row = await this.db.clubMembership.create({
      data: {
        personId: input.personId,
        clubUnitId: input.clubUnitId,
        memberType: input.memberType,
        isPrimary: input.isPrimary ?? false,
      },
    });
    return toClubMembership(row);
  }

  async findByPerson(personId: string): Promise<ClubMembership[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { personId },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toClubMembership);
  }

  /** M4 Slice 6: dues generation's membership roster — active (not yet left) memberships only. */
  async findActiveByClub(clubUnitId: string): Promise<ClubMembership[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { clubUnitId, leftAt: null },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toClubMembership);
  }

  /**
   * M9: the roster behind the meeting page's member pickers. Joins the
   * person's name in one query rather than N+1, and selects only the four
   * fields a picker renders — never `select *` back to the client.
   */
  async findActiveSummariesByClub(clubUnitId: string): Promise<ClubMemberSummary[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { clubUnitId, leftAt: null },
      select: {
        personId: true,
        memberType: true,
        localStatus: true,
        person: { select: { fullName: true } },
      },
      orderBy: { person: { fullName: 'asc' } },
    });
    return rows.map((row) => ({
      personId: row.personId,
      fullName: row.person.fullName,
      memberType: row.memberType,
      localStatus: row.localStatus,
    }));
  }

  /** M4 Slice 9: point-in-time member counts need every membership (including ones since left), not just currently-active ones. */
  async findAllByClub(clubUnitId: string): Promise<ClubMembership[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { clubUnitId },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toClubMembership);
  }
}
