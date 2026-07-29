import {
  supportProfile,
  supportRequest,
  type SupportProfile,
  type SupportRequest,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function getMySupportProfile(): Promise<SupportProfile | null> {
  const response = await authedFetch(`/v1/support-profile/mine`);
  if (!response.ok) return null;
  const body = await response.json();
  if (!body) return null;
  return supportProfile.parse(body);
}

export async function listSupportRequests(clubUnitId: string): Promise<SupportRequest[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/support-requests`);
  if (!response.ok) return [];
  return supportRequest.array().parse(await response.json());
}
