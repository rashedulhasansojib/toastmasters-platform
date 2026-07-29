import {
  libraryItem,
  contentPlanItem,
  type LibraryItem,
  type ContentPlanItem,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function listLibraryItems(clubUnitId: string): Promise<LibraryItem[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/library-items`);
  if (!response.ok) return [];
  return libraryItem.array().parse(await response.json());
}

export async function listGovernanceDocuments(clubUnitId: string): Promise<LibraryItem[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/governance-documents`);
  if (!response.ok) return [];
  return libraryItem.array().parse(await response.json());
}

export async function listContentPlan(clubUnitId: string): Promise<ContentPlanItem[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/content-plan`);
  if (!response.ok) return [];
  return contentPlanItem.array().parse(await response.json());
}
