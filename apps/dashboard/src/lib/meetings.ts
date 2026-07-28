import {
  agendaItem,
  agendaTemplate,
  ballot,
  capabilityTokenVerification,
  checklistRun,
  checklistTemplate,
  meeting,
  meetingLiveRecord,
  meetingRoleAssignment,
  roleRotationSuggestion,
  speechSlot,
  type AgendaItem,
  type AgendaTemplate,
  type Ballot,
  type CapabilityTokenVerification,
  type ChecklistRun,
  type ChecklistTemplate,
  type Meeting,
  type MeetingLiveRecord,
  type MeetingRoleAssignment,
  type MeetingRoleKey,
  type RoleRotationSuggestion,
  type SpeechSlot,
} from '@toastmasters/contracts';
import { authedFetch, callApi } from './session-proxy';

export async function listMeetings(clubUnitId: string): Promise<Meeting[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings`);
  if (!response.ok) return [];
  return meeting.array().parse(await response.json());
}

export async function getMeeting(clubUnitId: string, meetingId: string): Promise<Meeting | null> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}`);
  if (!response.ok) return null;
  return meeting.parse(await response.json());
}

export async function getAgendaItems(clubUnitId: string, meetingId: string): Promise<AgendaItem[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/agenda-items`);
  if (!response.ok) return [];
  return agendaItem.array().parse(await response.json());
}

export async function getAgendaTemplates(clubUnitId: string): Promise<AgendaTemplate[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/agenda-templates`);
  if (!response.ok) return [];
  return agendaTemplate.array().parse(await response.json());
}

export async function getRoleAssignments(
  clubUnitId: string,
  meetingId: string,
): Promise<MeetingRoleAssignment[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments`,
  );
  if (!response.ok) return [];
  return meetingRoleAssignment.array().parse(await response.json());
}

export async function getRoleRotationSuggestions(
  clubUnitId: string,
  meetingId: string,
  roleKey: MeetingRoleKey,
): Promise<RoleRotationSuggestion[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/suggestions?roleKey=${roleKey}`,
  );
  if (!response.ok) return [];
  return roleRotationSuggestion.array().parse(await response.json());
}

export async function getSpeechSlots(clubUnitId: string, meetingId: string): Promise<SpeechSlot[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/speech-slots`);
  if (!response.ok) return [];
  return speechSlot.array().parse(await response.json());
}

export async function getChecklistTemplates(clubUnitId: string): Promise<ChecklistTemplate[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/checklist-templates`);
  if (!response.ok) return [];
  return checklistTemplate.array().parse(await response.json());
}

export async function getChecklistRuns(
  clubUnitId: string,
  meetingId: string,
): Promise<ChecklistRun[]> {
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/checklist-runs`,
  );
  if (!response.ok) return [];
  return checklistRun.array().parse(await response.json());
}

export async function getLiveRecords(
  clubUnitId: string,
  meetingId: string,
): Promise<MeetingLiveRecord[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/live-records`);
  if (!response.ok) return [];
  return meetingLiveRecord.array().parse(await response.json());
}

export async function getBallots(clubUnitId: string, meetingId: string): Promise<Ballot[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/ballots`);
  if (!response.ok) return [];
  return ballot.array().parse(await response.json());
}

/** M3 Slice 6: `@Public()` on the API — guests hit this with no session/account, so it goes through `callApi` directly rather than `authedFetch`, which would forward a cookie a guest never has. */
export async function verifyCapabilityToken(token: string): Promise<CapabilityTokenVerification> {
  const response = await callApi('/v1/capability-tokens/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) return { valid: false, meetingId: null, purpose: null };
  return capabilityTokenVerification.parse(await response.json());
}
