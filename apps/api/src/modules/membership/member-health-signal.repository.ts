import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import {
  memberHealthBandFor,
  MEMBER_HEALTH_MS_PER_DAY,
  type MembershipRosterEntry,
  type MemberHealthSignal,
} from '@toastmasters/contracts';
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
        id: true,
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

    const unsignaled = rows.filter((row) => !row.healthSignal);
    const fallbacks =
      unsignaled.length === 0
        ? new Map<string, MemberHealthSignal>()
        : await this.computeFallbackSignals(clubUnitId, unsignaled);

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
        : (fallbacks.get(row.id) ?? null),
    }));
  }

  /**
   * A membership with no persisted `MemberHealthSignal` row yet (joined
   * since the worker's last nightly run) shouldn't just show a blank
   * where a health badge belongs — compute the same v1 band live, from
   * the same inputs, without writing it anywhere. `dataSource` is stamped
   * `speech_only_v1_live` so it's never confused for a persisted row.
   */
  private async computeFallbackSignals(
    clubUnitId: string,
    memberships: Array<{ id: string; personId: string; joinedAt: Date }>,
  ): Promise<Map<string, MemberHealthSignal>> {
    const now = new Date();
    const deliveredSlots = await this.db.speechSlot.findMany({
      where: {
        status: 'approved',
        speakerPersonId: { in: memberships.map((m) => m.personId) },
        meeting: { clubUnitId, scheduledAt: { lte: now } },
      },
      select: { speakerPersonId: true, meeting: { select: { scheduledAt: true } } },
    });

    const lastSpeechByPerson = new Map<string, Date>();
    for (const slot of deliveredSlots) {
      if (!slot.speakerPersonId) continue;
      const existing = lastSpeechByPerson.get(slot.speakerPersonId);
      if (!existing || slot.meeting.scheduledAt > existing) {
        lastSpeechByPerson.set(slot.speakerPersonId, slot.meeting.scheduledAt);
      }
    }

    const result = new Map<string, MemberHealthSignal>();
    for (const membership of memberships) {
      const lastSpeechAt = lastSpeechByPerson.get(membership.personId) ?? null;
      const reference = lastSpeechAt ?? membership.joinedAt;
      const daysSinceReference = Math.floor(
        (now.getTime() - reference.getTime()) / MEMBER_HEALTH_MS_PER_DAY,
      );
      const band = memberHealthBandFor(daysSinceReference);
      const reasons = lastSpeechAt
        ? [`Last prepared speech was ${daysSinceReference} days ago`]
        : [`No prepared speech since joining ${daysSinceReference} days ago`];

      result.set(membership.id, {
        id: randomUUID(),
        clubMembershipId: membership.id,
        computedAt: now.toISOString(),
        lastSpeechAt: lastSpeechAt?.toISOString() ?? null,
        daysSinceLastSpeech: lastSpeechAt ? daysSinceReference : null,
        band,
        reasons,
        dataSource: 'speech_only_v1_live',
      });
    }
    return result;
  }
}
