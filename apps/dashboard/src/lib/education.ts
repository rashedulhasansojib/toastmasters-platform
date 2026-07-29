import {
  educationRecord,
  speechEvaluation,
  mentorshipPairing,
  mentorshipSuggestion,
  onboardingTrack,
  onboardingProgress,
  type EducationRecord,
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
