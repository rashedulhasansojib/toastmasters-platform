import { clubSuccessPlan, type ClubSuccessPlan } from '@toastmasters/contracts';
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
