import { z } from 'zod';
import {
  orgUnitAncestorsResponseSchema,
  personDetailSchema,
  personSearchResponseSchema,
  programYear,
  roleTemplateSummary,
  type OrgUnitAncestorsResponse,
  type PersonDetail,
  type PersonSearchResponse,
  type ProgramYear,
  type RoleTemplateSummary,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

/** Users admin search — returns null on 403/404/any failure, same convention as getPlatformConsole/getOrgTreeLevel. */
export async function searchPeople(
  orgUnitId: string,
  params: { q?: string; limit?: number; offset?: number } = {},
): Promise<PersonSearchResponse | null> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  const response = await authedFetch(`/v1/org-units/${orgUnitId}/people${qs ? `?${qs}` : ''}`);
  if (!response.ok) return null;
  return personSearchResponseSchema.parse(await response.json());
}

export async function getPersonDetail(
  personId: string,
  anchorOrgUnitId: string,
): Promise<PersonDetail | null> {
  const response = await authedFetch(
    `/v1/people/${personId}?anchorOrgUnitId=${encodeURIComponent(anchorOrgUnitId)}`,
  );
  if (!response.ok) return null;
  return personDetailSchema.parse(await response.json());
}

/** The role picker's catalogue — an empty array (not null) on failure, since every caller may see it. */
export async function getRoleTemplates(): Promise<RoleTemplateSummary[]> {
  const response = await authedFetch('/v1/role-templates');
  if (!response.ok) return [];
  return z.array(roleTemplateSummary).parse(await response.json());
}

export async function getOrgUnitAncestors(
  orgUnitId: string,
): Promise<OrgUnitAncestorsResponse | null> {
  const response = await authedFetch(`/v1/org-units/${orgUnitId}/ancestors`);
  if (!response.ok) return null;
  return orgUnitAncestorsResponseSchema.parse(await response.json());
}

/** Prefills the "assign a role" form's termStart/termEnd with the program year's own boundaries. */
export async function getProgramYear(id: string): Promise<ProgramYear | null> {
  const response = await authedFetch(`/v1/program-years/${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  return programYear.parse(await response.json());
}
