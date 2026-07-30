import {
  guest,
  guestVisit,
  guestCommunication,
  publicMeetingSummary,
  membershipRosterEntry,
  speechHistoryEntry,
  roleAssignment,
  type Guest,
  type GuestVisit,
  type GuestCommunication,
  type ConvertGuestResponse,
  type PublicMeetingSummary,
  type MembershipRosterEntry,
  type SpeechHistoryEntry,
  type RoleAssignment,
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

/** CLAUDE.md §2 decision 11 (2026-07-30): the VP Membership dashboard's roster. */
export async function getMembershipRoster(clubUnitId: string): Promise<MembershipRosterEntry[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/membership/roster`);
  if (!response.ok) return [];
  return membershipRosterEntry.array().parse(await response.json());
}

export async function getMemberSpeechHistory(
  clubUnitId: string,
  personId: string,
): Promise<SpeechHistoryEntry[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/membership/${personId}/speech-history`,
  );
  if (!response.ok) return [];
  return speechHistoryEntry.array().parse(await response.json());
}

/** Backs the landing redirect: the signed-in person's own active roles in one club. */
export async function getMyRoleAssignments(clubUnitId: string): Promise<RoleAssignment[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/role-assignments/mine`);
  if (!response.ok) return [];
  return roleAssignment.array().parse(await response.json());
}

export type { ConvertGuestResponse };
