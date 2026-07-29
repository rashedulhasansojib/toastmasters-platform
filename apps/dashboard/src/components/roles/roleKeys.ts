import type { MeetingRoleKey } from '@toastmasters/contracts';

/** system-design.md §9.2's fixed roleKey vocabulary (packages/contracts/src/meeting.ts) — mirrored here only for display labels, not as a second source of truth for the set itself (the API still rejects anything outside it). */
export const MEETING_ROLE_KEYS: { value: MeetingRoleKey; label: string }[] = [
  { value: 'president', label: 'President' },
  { value: 'sergeant_at_arms', label: 'Sergeant at Arms' },
  { value: 'toastmaster', label: 'Toastmaster of the Day' },
  { value: 'general_evaluator', label: 'General Evaluator' },
  { value: 'table_topics_master', label: 'Table Topics Master' },
  { value: 'table_topics_evaluator', label: 'Table Topics Evaluator' },
  { value: 'ah_counter', label: 'Ah-Counter' },
  { value: 'timer', label: 'Timer' },
  { value: 'grammarian', label: 'Grammarian' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'evaluator', label: 'Evaluator' },
];

/** Officer roles shown as a fixed grid on the Meeting Agenda tab, in the
 * order the room fills them. `speaker` and `evaluator` are per-slot and
 * handled by the Prepared Speakers section, so they're excluded here. */
export const AGENDA_ROLE_KEYS: MeetingRoleKey[] = [
  'president',
  'sergeant_at_arms',
  'toastmaster',
  'general_evaluator',
  'table_topics_master',
  'table_topics_evaluator',
  'ah_counter',
  'timer',
  'grammarian',
];
