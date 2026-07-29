import {
  clubEducationProgressRow,
  educationRecord,
  speechApproval,
  speechEvaluation,
  mentorshipPairing,
  mentorshipSuggestion,
  onboardingTrack,
  onboardingProgress,
  type ClubEducationProgressRow,
  type EducationRecord,
  type SpeechApproval,
  type SpeechApprovalStatus,
  type SpeechEvaluation,
  type MentorshipPairing,
  type MentorshipSuggestion,
  type OnboardingTrack,
  type OnboardingProgress,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function listEducationRecords(
  clubUnitId: string,
  personId?: string,
): Promise<EducationRecord[]> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : '';
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/education-records${qs}`);
  if (!response.ok) return [];
  return educationRecord.array().parse(await response.json());
}

/**
 * The club education roster. Returns `null` — not `[]` — when the caller
 * lacks `education.progress: read`, so the page can say "officers only"
 * rather than show an empty club.
 */
export async function listClubEducationProgress(
  clubUnitId: string,
): Promise<ClubEducationProgressRow[] | null> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/education/progress`);
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) return [];
  return clubEducationProgressRow.array().parse(await response.json());
}

/**
 * M11 Slice 2: the club's speech-credit approvals. Returns `null` — not `[]`
 * — when the caller lacks `education.approval:read`, so the drawer can hide
 * the VPE-only Approve/Deny buttons without a separate capability probe.
 */
export async function listSpeechApprovals(
  clubUnitId: string,
  status?: SpeechApprovalStatus,
): Promise<SpeechApproval[] | null> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/education/approvals${qs}`);
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) return [];
  return speechApproval.array().parse(await response.json());
}

export async function listMyEvaluations(clubUnitId: string): Promise<SpeechEvaluation[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/evaluations/mine`);
  if (!response.ok) return [];
  return speechEvaluation.array().parse(await response.json());
}

export async function listMentorshipPairings(clubUnitId: string): Promise<MentorshipPairing[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/mentorship/pairings`);
  if (!response.ok) return [];
  return mentorshipPairing.array().parse(await response.json());
}

export async function getMentorshipSuggestions(
  clubUnitId: string,
  menteePersonId: string,
): Promise<MentorshipSuggestion[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/mentorship/suggestions?menteePersonId=${encodeURIComponent(menteePersonId)}`,
  );
  if (!response.ok) return [];
  return mentorshipSuggestion.array().parse(await response.json());
}

export async function listOnboardingTracks(clubUnitId: string): Promise<OnboardingTrack[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/onboarding-tracks`);
  if (!response.ok) return [];
  return onboardingTrack.array().parse(await response.json());
}

export async function listOnboardingProgress(
  clubUnitId: string,
  personId?: string,
): Promise<OnboardingProgress[]> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : '';
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/onboarding-progress${qs}`);
  if (!response.ok) return [];
  return onboardingProgress.array().parse(await response.json());
}
