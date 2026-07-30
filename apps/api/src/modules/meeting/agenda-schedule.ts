import type { MeetingRoleAssignment, MeetingRoleKey, SpeechSlot } from '@toastmasters/contracts';

/**
 * The legacy portal's `lib/agendaSchedule.ts`, ported server-side.
 *
 * The printed agenda is **derived** from the roles and the prepared
 * speakers — not from hand-entered line items. That is what the legacy
 * portal did, and it is why the meeting page has no "agenda line items"
 * block: the running order of a Toastmasters meeting is fixed, so the only
 * things a club actually edits are who holds each role and who speaks.
 */
export const AGENDA_DURATIONS = {
  saaOpensFloor: 10,
  poCallsToOrder: 10,
  nationalAnthem: 5,
  welcomeGuests: 5,
  introTmoe: 1,
  tmoeTheme: 2,
  tmoeIntroGe: 10,
  evaluatorObjectives: 2,
  defaultSpeechMinutes: 7,
  tmoeIntroTtm: 2,
  tableTopicSession: 15,
  psSpeechEvaluations: 10,
  ttSpeechEvaluations: 10,
  ahCounterReport: 2,
  timerReport: 2,
  grammarianReport: 2,
  tmoeInvitesPo: 2,
  feedbackQA: 4,
} as const;

export type AgendaSubRow = {
  label: string;
  person?: string;
  minutes?: number;
  italic?: boolean;
};

export type AgendaRow = {
  time: string;
  label: string;
  person?: string;
  minutes?: number;
  subRows?: AgendaSubRow[];
};

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export type ScheduleInput = {
  /** Local wall-clock start, in minutes past midnight, in the club's zone. */
  startMinutes: number;
  roleAssignments: MeetingRoleAssignment[];
  speechSlots: SpeechSlot[];
  /** Resolves a person id to a display name. */
  nameOf: (personId: string | null | undefined) => string;
  /** Resolves a guest id to a display name. Falls back to `nameOf` behaviour ('—') for unknown ids. */
  guestNameOf?: (guestId: string | null | undefined) => string;
};

export function buildAgendaSchedule(input: ScheduleInput): AgendaRow[] {
  const { startMinutes, roleAssignments, speechSlots, nameOf } = input;
  const guestNameOf = input.guestNameOf ?? (() => '—');

  /** A declined assignment leaves the seat open, so it never reaches the agenda. */
  const holder = (roleKey: MeetingRoleKey): string | undefined => {
    const assignment = roleAssignments.find(
      (a) => a.roleKey === roleKey && a.status !== 'declined' && a.assignee.kind !== 'unfilled',
    );
    if (!assignment || assignment.assignee.kind === 'unfilled') return undefined;
    if (assignment.assignee.kind === 'guest') return guestNameOf(assignment.assignee.guestId);
    return nameOf(assignment.assignee.personId);
  };

  const speakerName = (slot: SpeechSlot) => nameOf(slot.speakerPersonId ?? slot.requestedBy);

  const rows: AgendaRow[] = [];
  let offset = 0;
  const push = (row: AgendaRow) => rows.push(row);

  push({
    time: formatTime(startMinutes + offset),
    label: 'Sergeant at Arms opens the floor',
    person: holder('sergeant_at_arms'),
    minutes: AGENDA_DURATIONS.saaOpensFloor,
    subRows: [{ label: 'Ground rules' }, { label: 'Mission Statement' }],
  });
  offset += AGENDA_DURATIONS.saaOpensFloor;

  push({
    time: formatTime(startMinutes + offset),
    label: 'Presiding Officer calls the Meeting to order',
    person: holder('president'),
    minutes: AGENDA_DURATIONS.poCallsToOrder,
    subRows: [
      { label: 'National Anthem', minutes: AGENDA_DURATIONS.nationalAnthem },
      { label: 'Welcome guests & Round-Roaming Session', minutes: AGENDA_DURATIONS.welcomeGuests },
    ],
  });
  offset += AGENDA_DURATIONS.poCallsToOrder;

  push({
    time: formatTime(startMinutes + offset),
    label: 'Introduction of the Toastmaster of the Day',
    person: holder('toastmaster'),
    minutes: AGENDA_DURATIONS.introTmoe,
  });
  offset += AGENDA_DURATIONS.introTmoe;

  push({
    time: formatTime(startMinutes + offset),
    label: 'TMOE introduces the Theme of the Day',
    minutes: AGENDA_DURATIONS.tmoeTheme,
  });
  offset += AGENDA_DURATIONS.tmoeTheme;

  push({
    time: formatTime(startMinutes + offset),
    label: 'TMOE introduces the General Evaluator',
    person: holder('general_evaluator'),
    minutes: AGENDA_DURATIONS.tmoeIntroGe,
    subRows: [
      { label: 'Ah Counter', person: holder('ah_counter') },
      { label: 'Timer', person: holder('timer') },
      { label: 'Grammarian', person: holder('grammarian') },
    ],
  });
  offset += AGENDA_DURATIONS.tmoeIntroGe;

  // Prepared Speech Session — one block per approved/pending speaker, each
  // preceded by their evaluator stating the project's objectives.
  const speaking = speechSlots.filter((s) => s.status !== 'declined');
  if (speaking.length > 0) {
    const subRows: AgendaSubRow[] = [];
    let sessionMinutes = 0;

    speaking.forEach((slot, index) => {
      const speechMinutes = Math.max(
        1,
        Math.round(slot.plannedDurationSeconds / 60) || AGENDA_DURATIONS.defaultSpeechMinutes,
      );
      subRows.push({
        label: 'Evaluator explains Objectives',
        person: slot.evaluatorPersonId ? nameOf(slot.evaluatorPersonId) : undefined,
        minutes: AGENDA_DURATIONS.evaluatorObjectives,
      });
      subRows.push({
        label: `${index + 1}. ${slot.title || `Speaker ${index + 1}`}`,
        person: speakerName(slot),
        minutes: speechMinutes,
      });
      const detail = [slot.pathCode, slot.projectCode, `Level ${slot.level}`, slot.notes]
        .filter(Boolean)
        .join('  ·  ');
      if (detail) subRows.push({ label: detail, italic: true });
      sessionMinutes += AGENDA_DURATIONS.evaluatorObjectives + speechMinutes;
    });

    push({
      time: formatTime(startMinutes + offset),
      label: 'Prepared Speech Session',
      minutes: sessionMinutes,
      subRows,
    });
    offset += sessionMinutes;
  }

  push({
    time: formatTime(startMinutes + offset),
    label: 'TMOE introduces the Table Topic Master',
    person: holder('table_topics_master'),
    minutes: AGENDA_DURATIONS.tmoeIntroTtm,
    subRows: [{ label: 'Table Topic Session', minutes: AGENDA_DURATIONS.tableTopicSession }],
  });
  offset += AGENDA_DURATIONS.tmoeIntroTtm + AGENDA_DURATIONS.tableTopicSession;

  const evaluationMinutes =
    AGENDA_DURATIONS.psSpeechEvaluations +
    AGENDA_DURATIONS.ttSpeechEvaluations +
    AGENDA_DURATIONS.ahCounterReport +
    AGENDA_DURATIONS.timerReport +
    AGENDA_DURATIONS.grammarianReport;

  push({
    time: formatTime(startMinutes + offset),
    label: 'TMOE invites the General Evaluator',
    person: holder('general_evaluator'),
    minutes: evaluationMinutes,
    subRows: [
      {
        label: 'Prepared Speech Evaluations',
        person: speaking[0]?.evaluatorPersonId ? nameOf(speaking[0].evaluatorPersonId) : undefined,
        minutes: AGENDA_DURATIONS.psSpeechEvaluations,
      },
      {
        label: 'Table Topic Speech Evaluations',
        person: holder('table_topics_evaluator'),
        minutes: AGENDA_DURATIONS.ttSpeechEvaluations,
      },
      {
        label: "Ah Counter's Report",
        person: holder('ah_counter'),
        minutes: AGENDA_DURATIONS.ahCounterReport,
      },
      {
        label: "Timer's Report",
        person: holder('timer'),
        minutes: AGENDA_DURATIONS.timerReport,
      },
      {
        label: "Grammarian's Report",
        person: holder('grammarian'),
        minutes: AGENDA_DURATIONS.grammarianReport,
      },
    ],
  });
  offset += evaluationMinutes;

  push({
    time: formatTime(startMinutes + offset),
    label: 'TMOE invites the Presiding Officer',
    person: holder('president'),
    minutes: AGENDA_DURATIONS.tmoeInvitesPo,
    subRows: [{ label: 'Feedback & Q&A', minutes: AGENDA_DURATIONS.feedbackQA }],
  });
  offset += AGENDA_DURATIONS.tmoeInvitesPo + AGENDA_DURATIONS.feedbackQA;

  push({ time: formatTime(startMinutes + offset), label: 'Meeting Conclusion' });

  return rows;
}
