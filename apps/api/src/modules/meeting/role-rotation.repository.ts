import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { RoleRotationSuggestion, MeetingRoleKey } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

const DECLINE_COOLDOWN_DAYS = 60;
const SUGGESTION_LIMIT = 10;

/**
 * M3 Slice 8: system-design.md §9.3's rotation-fairness ranking — "ranked
 * suggestions with the reason shown", never auto-assignment. `blackoutDates`
 * (§9.3) isn't modeled on `Person` yet, so that filter is skipped; everything
 * else in the spec's query is implemented as written.
 */
@Injectable()
export class RoleRotationRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async suggest(input: {
    clubUnitId: string;
    meetingId: string;
    roleKey: MeetingRoleKey;
  }): Promise<RoleRotationSuggestion[]> {
    const cooldownSince = new Date(Date.now() - DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    const [activeMembers, assignedThisMeeting, recentDeclines, fulfilledHistory] =
      await Promise.all([
        this.db.clubMembership.findMany({
          where: { clubUnitId: input.clubUnitId, localStatus: 'active' },
          include: { person: true },
        }),
        this.db.meetingRoleAssignment.findMany({
          where: {
            meetingId: input.meetingId,
            assigneePersonId: { not: null },
            status: { not: 'declined' },
          },
          select: { assigneePersonId: true },
        }),
        this.db.meetingRoleAssignment.findMany({
          where: {
            roleKey: input.roleKey,
            status: 'declined',
            assigneePersonId: { not: null },
            createdAt: { gte: cooldownSince },
          },
          select: { assigneePersonId: true },
        }),
        this.db.meetingRoleAssignment.findMany({
          where: { roleKey: input.roleKey, status: 'fulfilled', assigneePersonId: { not: null } },
          select: { assigneePersonId: true, fulfilledAt: true },
          orderBy: { fulfilledAt: 'desc' },
        }),
      ]);

    const excluded = new Set([
      ...assignedThisMeeting.map((a) => a.assigneePersonId),
      ...recentDeclines.map((d) => d.assigneePersonId),
    ]);

    const lastFulfilledByPerson = new Map<string, Date>();
    for (const record of fulfilledHistory) {
      if (
        record.assigneePersonId &&
        record.fulfilledAt &&
        !lastFulfilledByPerson.has(record.assigneePersonId)
      ) {
        lastFulfilledByPerson.set(record.assigneePersonId, record.fulfilledAt);
      }
    }

    const eligible = activeMembers.filter((m) => !excluded.has(m.personId));

    const ranked = eligible
      .map((m) => {
        const lastFulfilledAt = lastFulfilledByPerson.get(m.personId) ?? null;
        const stalenessDays = lastFulfilledAt
          ? Math.floor((Date.now() - lastFulfilledAt.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          personId: m.personId,
          fullName: m.person.fullName,
          lastFulfilledAt: lastFulfilledAt?.toISOString() ?? null,
          stalenessDays,
          reason: lastFulfilledAt
            ? `${m.person.fullName} — last ${input.roleKey} ${stalenessDays} day${stalenessDays === 1 ? '' : 's'} ago`
            : `${m.person.fullName} — never held ${input.roleKey}`,
        };
      })
      .sort((a, b) => {
        if (a.stalenessDays === null && b.stalenessDays === null) return 0;
        if (a.stalenessDays === null) return -1;
        if (b.stalenessDays === null) return 1;
        return b.stalenessDays - a.stalenessDays;
      });

    return ranked.slice(0, SUGGESTION_LIMIT);
  }
}
