import { orgTreeLevelSchema, type OrgTreeLevel } from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

/**
 * One level of the org-tree browser. Returns null on 403/404/any failure, so
 * the page can render a "not available" state rather than throwing — same
 * convention as `getPlatformConsole`.
 */
export async function getOrgTreeLevel(
  regionUnitId: string,
  parentId?: string,
): Promise<OrgTreeLevel | null> {
  const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
  const response = await authedFetch(`/v1/platform/${regionUnitId}/org-tree${query}`);
  if (!response.ok) return null;
  return orgTreeLevelSchema.parse(await response.json());
}
