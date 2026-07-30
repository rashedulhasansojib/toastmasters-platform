import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { MembershipRosterEntry } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the VP Membership dashboard's
 * roster. Read-only — `MemberHealthSignal` rows are only ever written by
 * the worker's nightly job, never by an API write path. Gated on the
 * restricted `membership.health_signal` resource at the controller, not on
 * `identity.club_member` — that resource's `clubMemberSummary` is
 * deliberately narrower (name only, read by every club role); this join
 * carries email/phone/band, which is VPM-only (FR-OVS-3, FR-MEM-5).
 */
@Injectable()
export class MemberHealthSignalRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async findRosterByClub(clubUnitId: string): Promise<MembershipRosterEntry[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { clubUnitId, localStatus: 'active', leftAt: null },
      select: {
        personId: true,
        memberType: true,
        localStatus: true,
        joinedAt: true,
        person: { select: { fullName: true, email: true, phone: true, photoUrl: true } },
        healthSignal: {
          select: {
            id: true,
            clubMembershipId: true,
            computedAt: true,
            lastSpeechAt: true,
            daysSinceLastSpeech: true,
            band: true,
            reasons: true,
            dataSource: true,
          },
        },
      },
      orderBy: { person: { fullName: 'asc' } },
    });

    return rows.map((row) => ({
      personId: row.personId,
      fullName: row.person.fullName,
      email: row.person.email,
      phone: row.person.phone,
      photoUrl: row.person.photoUrl,
      memberType: row.memberType,
      localStatus: row.localStatus,
      joinedAt: row.joinedAt.toISOString(),
      healthSignal: row.healthSignal
        ? {
            id: row.healthSignal.id,
            clubMembershipId: row.healthSignal.clubMembershipId,
            computedAt: row.healthSignal.computedAt.toISOString(),
            lastSpeechAt: row.healthSignal.lastSpeechAt?.toISOString() ?? null,
            daysSinceLastSpeech: row.healthSignal.daysSinceLastSpeech,
            band: row.healthSignal.band,
            reasons: row.healthSignal.reasons as string[],
            dataSource: row.healthSignal.dataSource,
          }
        : null,
    }));
  }
}
