import {
  clubSuccessPlan,
  excomMeeting,
  motion,
  minutes,
  divisionDashboardResponse,
  type ClubSuccessPlan,
  type ExComMeeting,
  type Motion,
  type Minutes,
  type DivisionDashboardResponse,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function getClubSuccessPlan(
  clubUnitId: string,
  programYearId: string | null,
): Promise<ClubSuccessPlan | null> {
  if (!programYearId) return null;
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/success-plan?programYearId=${encodeURIComponent(programYearId)}`,
  );
  if (!response.ok) return null;
  return clubSuccessPlan.parse(await response.json());
}

export async function listExComMeetings(clubUnitId: string): Promise<ExComMeeting[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/excom-meetings`);
  if (!response.ok) return [];
  return excomMeeting.array().parse(await response.json());
}

export async function listMotions(clubUnitId: string, excomMeetingId: string): Promise<Motion[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/excom-meetings/${excomMeetingId}/motions`,
  );
  if (!response.ok) return [];
  return motion.array().parse(await response.json());
}

export async function listMinutes(clubUnitId: string): Promise<Minutes[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/minutes`);
  if (!response.ok) return [];
  return minutes.array().parse(await response.json());
}

export async function getDivisionDashboard(
  divisionUnitId: string,
  programYearId: string | null,
): Promise<DivisionDashboardResponse | null> {
  if (!programYearId) return null;
  const response = await authedFetch(
    `/v1/divisions/${divisionUnitId}/dashboard?programYearId=${encodeURIComponent(programYearId)}`,
  );
  if (!response.ok) return null;
  return divisionDashboardResponse.parse(await response.json());
}
