import {
  prospect,
  prospectVisit,
  prospectCommunication,
  publicMeetingSummary,
  type Prospect,
  type ProspectVisit,
  type ProspectCommunication,
  type ConvertProspectResponse,
  type PublicMeetingSummary,
} from '@toastmasters/contracts';
import { authedFetch, callApi } from './session-proxy';

export async function listProspects(clubUnitId: string): Promise<Prospect[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/prospects`);
  if (!response.ok) return [];
  return prospect.array().parse(await response.json());
}

export async function getProspect(
  clubUnitId: string,
  prospectId: string,
): Promise<Prospect | null> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/prospects/${prospectId}`);
  if (!response.ok) return null;
  return prospect.parse(await response.json());
}

export async function getProspectVisits(
  clubUnitId: string,
  prospectId: string,
): Promise<ProspectVisit[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/prospects/${prospectId}/visits`);
  if (!response.ok) return [];
  return prospectVisit.array().parse(await response.json());
}

export async function getProspectCommunications(
  clubUnitId: string,
  prospectId: string,
): Promise<ProspectCommunication[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/prospects/${prospectId}/communications`,
  );
  if (!response.ok) return [];
  return prospectCommunication.array().parse(await response.json());
}

/** M4 Slice 10: public, no session — the guest lands here from a `guest_register` capability-token link. */
export async function getUpcomingMeetings(clubUnitId: string): Promise<PublicMeetingSummary[]> {
  const response = await callApi(`/v1/public/clubs/${clubUnitId}/meetings/upcoming`, {
    cache: 'no-store',
  });
  if (!response.ok) return [];
  return publicMeetingSummary.array().parse(await response.json());
}

export type { ConvertProspectResponse };
