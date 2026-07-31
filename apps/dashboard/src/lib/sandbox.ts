import {
  sandboxMember,
  sandboxMeeting,
  sandboxPlannerEntry,
  sandboxGuest,
  sandboxEducationRecord,
  type SandboxMember,
  type SandboxMeeting,
  type SandboxPlannerEntry,
  type SandboxGuest,
  type SandboxEducationRecord,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

/** Reads for the sandbox dashboard (public demo-signup link) — see apps/api's sandbox module. */

export async function listSandboxMembers(): Promise<SandboxMember[]> {
  const response = await authedFetch('/v1/sandbox/members');
  if (!response.ok) return [];
  return sandboxMember.array().parse(await response.json());
}

export async function listSandboxMeetings(): Promise<SandboxMeeting[]> {
  const response = await authedFetch('/v1/sandbox/meetings');
  if (!response.ok) return [];
  return sandboxMeeting.array().parse(await response.json());
}

export async function listSandboxPlanner(): Promise<SandboxPlannerEntry[]> {
  const response = await authedFetch('/v1/sandbox/planner');
  if (!response.ok) return [];
  return sandboxPlannerEntry.array().parse(await response.json());
}

export async function listSandboxGuests(): Promise<SandboxGuest[]> {
  const response = await authedFetch('/v1/sandbox/guests');
  if (!response.ok) return [];
  return sandboxGuest.array().parse(await response.json());
}

export async function listSandboxEducation(): Promise<SandboxEducationRecord[]> {
  const response = await authedFetch('/v1/sandbox/education');
  if (!response.ok) return [];
  return sandboxEducationRecord.array().parse(await response.json());
}
