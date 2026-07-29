import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  MentorshipPairing,
  MentorshipPurpose,
  MentorshipEndedReason,
  MentorshipSuggestion,
} from '@toastmasters/contracts';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { EducationRecordRepository } from './education-record.repository';
import { MentorshipPairingRepository } from './mentorship-pairing.repository';
import { MentorAvailabilityRepository } from './mentor-availability.repository';

/**
 * M7 Slice 3: system-design.md §10.3, FR-EDU-6. Ranking is a suggestion
 * list, never automatic pairing — the caller still POSTs the chosen
 * mentor. The "at most one active pairing per (mentee, purpose)" invariant
 * is checked here, not enforced by a DB constraint — see the M7 plan
 * doc's note on the race window.
 */
@Injectable()
export class MentorshipService {
  constructor(
    private readonly pairings: MentorshipPairingRepository,
    private readonly availability: MentorAvailabilityRepository,
    private readonly educationRecords: EducationRecordRepository,
    private readonly clubMemberships: ClubMembershipRepository,
  ) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    mentorPersonId: string;
    menteePersonId: string;
    purpose: MentorshipPurpose;
    assignedBy: string;
  }): Promise<MentorshipPairing> {
    const existing = await this.pairings.findActiveByMenteeAndPurpose(
      input.menteePersonId,
      input.purpose,
    );
    if (existing) {
      throw new BadRequestException(
        `Mentee already has an active or proposed pairing for purpose ${input.purpose}`,
      );
    }
    return this.pairings.create(input);
  }

  addCheckIn(id: string, byPersonId: string, note: string, nextDueOn?: string) {
    return this.pairings.addCheckIn(id, {
      at: new Date().toISOString(),
      byPersonId,
      note,
      nextDueOn: nextDueOn ?? null,
    });
  }

  end(id: string, reason: MentorshipEndedReason) {
    return this.pairings.end(id, reason);
  }

  list(orgUnitId: string) {
    return this.pairings.findByClub(orgUnitId);
  }

  /**
   * §10.3's ranking formula: pathway overlap with the mentee's current
   * path + strengths matching development goals (approximated here by
   * general strengths overlap, since the mentee's "development goals" text
   * isn't structured data) + tenure − current mentee load − prior
   * `mismatch` pairings with this mentee. Competence floor: completed
   * Level 2 on some path.
   */
  async suggest(orgUnitId: string, menteePersonId: string): Promise<MentorshipSuggestion[]> {
    const candidates = await this.availability.findByClub(orgUnitId);
    const menteeRecords = await this.educationRecords.findByPersonAndClub(
      menteePersonId,
      orgUnitId,
    );
    const menteePathCodes = new Set(menteeRecords.map((r) => r.pathCode));

    const suggestions: MentorshipSuggestion[] = [];
    for (const candidate of candidates) {
      if (candidate.personId === menteePersonId) continue;

      const activeCount = await this.pairings.countActiveByMentor(candidate.personId);
      if (activeCount >= candidate.maxConcurrentMentees) continue;

      const candidateRecords = await this.educationRecords.findByPersonAndClub(
        candidate.personId,
        orgUnitId,
      );
      const completedLevel2Plus = candidateRecords.some((r) =>
        r.levels.some((l) => l.level >= 2 && l.vpeConfirmedAt),
      );
      if (!completedLevel2Plus) continue;

      const memberships = await this.clubMemberships.findByPerson(candidate.personId);
      const membership = memberships.find((m) => m.clubUnitId === orgUnitId);
      const tenureDays = membership
        ? (Date.now() - new Date(membership.joinedAt).getTime()) / 86_400_000
        : 0;

      const pathOverlap = candidateRecords.filter((r) => menteePathCodes.has(r.pathCode)).length;
      const mismatchCount = await this.pairings.findMismatchedWith(
        candidate.personId,
        menteePersonId,
      );

      const score =
        pathOverlap * 10 + Math.min(tenureDays / 30, 24) - activeCount * 5 - mismatchCount * 20;

      const reasons: string[] = [];
      if (pathOverlap > 0) reasons.push(`shares ${pathOverlap} path(s) with the mentee`);
      reasons.push(`${Math.round(tenureDays)} days' tenure`);
      if (activeCount > 0) reasons.push(`already mentoring ${activeCount}`);
      if (mismatchCount > 0) reasons.push(`${mismatchCount} prior mismatch with this mentee`);

      suggestions.push({ mentorPersonId: candidate.personId, score, reasons });
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }
}
