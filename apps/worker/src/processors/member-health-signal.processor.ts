import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@toastmasters/db';
import { memberHealthBandFor, MEMBER_HEALTH_MS_PER_DAY } from '@toastmasters/contracts';

export const MEMBER_HEALTH_SIGNAL_QUEUE = 'member-health-signal';

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the VP Membership dashboard's
 * member-health signal v1. Bands solely on `daysSinceLastSpeech` — the
 * latest *approved* `SpeechSlot` where the member was speaker, on a meeting
 * that has occurred. Reference date is the last speech, or `joinedAt` for a
 * member who has never spoken (a grace period for new members). Recomputed
 * nightly, one row per `ClubMembership` (upsert).
 *
 * `dataSource: 'speech_only_v1'` is stamped on every row — the remaining
 * `system-design.md` §11.3 inputs (attendance, dues, pathway progress) and
 * `RetentionAlert` stay deferred to M8, same as the already-deferred
 * officer-activeness score.
 */
@Processor(MEMBER_HEALTH_SIGNAL_QUEUE)
export class MemberHealthSignalProcessor extends WorkerHost {
  private readonly logger = new Logger(MemberHealthSignalProcessor.name);

  async process(_job: Job): Promise<{ clubsProcessed: number; signalsComputed: number }> {
    const db = getPrisma();
    const now = new Date();
    const clubs = await db.orgUnit.findMany({ where: { type: 'club' }, select: { id: true } });

    let clubsProcessed = 0;
    let signalsComputed = 0;

    for (const club of clubs) {
      const programYear = await db.programYear.findFirst({ where: { status: 'current' } });
      if (!programYear) continue;

      const memberships = await db.clubMembership.findMany({
        where: { clubUnitId: club.id, localStatus: 'active', leftAt: null },
        select: { id: true, personId: true, joinedAt: true },
      });
      if (memberships.length === 0) {
        clubsProcessed += 1;
        continue;
      }

      const deliveredSlots = await db.speechSlot.findMany({
        where: {
          status: 'approved',
          speakerPersonId: { in: memberships.map((m) => m.personId) },
          meeting: { clubUnitId: club.id, scheduledAt: { lte: now } },
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

        await db.memberHealthSignal.upsert({
          where: { clubMembershipId: membership.id },
          create: {
            orgUnitId: club.id,
            personId: membership.personId,
            clubMembershipId: membership.id,
            programYearId: programYear.id,
            lastSpeechAt,
            daysSinceLastSpeech: lastSpeechAt ? daysSinceReference : null,
            band,
            reasons,
          },
          update: {
            programYearId: programYear.id,
            lastSpeechAt,
            daysSinceLastSpeech: lastSpeechAt ? daysSinceReference : null,
            band,
            reasons,
            computedAt: now,
          },
        });
        signalsComputed += 1;
      }
      clubsProcessed += 1;
    }

    this.logger.log({ clubsProcessed, signalsComputed }, 'member health signal job ran');
    return { clubsProcessed, signalsComputed };
  }
}
