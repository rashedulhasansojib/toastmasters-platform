import type { MeetingRoleKey } from '@toastmasters/contracts';

/** system-design.md §9.2's fixed roleKey vocabulary (packages/contracts/src/meeting.ts) — mirrored here only for display labels, not as a second source of truth for the set itself (the API still rejects anything outside it). */
export const MEETING_ROLE_KEYS: { value: MeetingRoleKey; label: string }[] = [
  { value: 'toastmaster', label: 'Toastmaster' },
  { value: 'general_evaluator', label: 'General Evaluator' },
  { value: 'table_topics_master', label: 'Table Topics Master' },
  { value: 'timer', label: 'Timer' },
  { value: 'ah_counter', label: 'Ah-Counter' },
  { value: 'grammarian', label: 'Grammarian' },
  { value: 'sergeant_at_arms', label: 'Sergeant at Arms' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'evaluator', label: 'Evaluator' },
];
