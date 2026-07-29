import {
  guest,
  guestVisit,
  guestCommunication,
  publicMeetingSummary,
  type Guest,
  type GuestVisit,
  type GuestCommunication,
  type ConvertGuestResponse,
  type PublicMeetingSummary,
} from '@toastmasters/contracts';
import { authedFetch, callApi } from './session-proxy';

export async function listGuests(clubUnitId: string): Promise<Guest[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/guests`);
  if (!response.ok) return [];
  return guest.array().parse(await response.json());
}

export async function getGuest(clubUnitId: string, guestId: string): Promise<Guest | null> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/guests/${guestId}`);
  if (!response.ok) return null;
  return guest.parse(await response.json());
}

export async function getGuestVisits(clubUnitId: string, guestId: string): Promise<GuestVisit[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/guests/${guestId}/visits`);
  if (!response.ok) return [];
  return guestVisit.array().parse(await response.json());
}

export async function getGuestCommunications(
  clubUnitId: string,
  guestId: string,
): Promise<GuestCommunication[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/guests/${guestId}/communications`);
  if (!response.ok) return [];
  return guestCommunication.array().parse(await response.json());
}

/** M4 Slice 10: public, no session — the guest lands here from a `guest_register` capability-token link. */
export async function getUpcomingMeetings(clubUnitId: string): Promise<PublicMeetingSummary[]> {
  const response = await callApi(`/v1/public/clubs/${clubUnitId}/meetings/upcoming`, {
    cache: 'no-store',
  });
  if (!response.ok) return [];
  return publicMeetingSummary.array().parse(await response.json());
}

export type { ConvertGuestResponse };
