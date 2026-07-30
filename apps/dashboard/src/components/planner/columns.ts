import type { MeetingRoleKey, PlannerCell, PlannerRow } from '@toastmasters/contracts';

/**
 * The grid's columns, in the order a club reads its planning sheet. Speakers
 * and evaluators interleave because that is how they are filled — you assign
 * an evaluator to a speaker, not to a slot number.
 */
export const PLANNER_COLUMNS: Array<{
  roleKey: MeetingRoleKey;
  slotIndex: number | null;
  label: string;
  short: string;
}> = [
  { roleKey: 'toastmaster', slotIndex: null, label: 'Toastmaster', short: 'TMOD' },
  { roleKey: 'table_topics_master', slotIndex: null, label: 'Table Topics Master', short: 'TTM' },
  {
    roleKey: 'table_topics_evaluator',
    slotIndex: null,
    label: 'Table Topics Evaluator',
    short: 'TT Eval',
  },
  { roleKey: 'speaker', slotIndex: 0, label: 'Speaker 1', short: 'Sp 1' },
  { roleKey: 'evaluator', slotIndex: 0, label: 'Evaluator 1', short: 'Ev 1' },
  { roleKey: 'speaker', slotIndex: 1, label: 'Speaker 2', short: 'Sp 2' },
  { roleKey: 'evaluator', slotIndex: 1, label: 'Evaluator 2', short: 'Ev 2' },
  { roleKey: 'speaker', slotIndex: 2, label: 'Speaker 3', short: 'Sp 3' },
  { roleKey: 'evaluator', slotIndex: 2, label: 'Evaluator 3', short: 'Ev 3' },
  { roleKey: 'general_evaluator', slotIndex: null, label: 'General Evaluator', short: 'GE' },
  { roleKey: 'timer', slotIndex: null, label: 'Timer', short: 'Timer' },
  { roleKey: 'ah_counter', slotIndex: null, label: 'Ah-Counter', short: 'Ah' },
  { roleKey: 'grammarian', slotIndex: null, label: 'Grammarian', short: 'Gram' },
];

/** `slotIndex` is nullable on both sides, so compare it explicitly rather than by truthiness. */
export function cellFor(
  row: PlannerRow,
  roleKey: MeetingRoleKey,
  slotIndex: number | null,
): PlannerCell | undefined {
  return row.cells.find((c) => c.roleKey === roleKey && (c.slotIndex ?? null) === slotIndex);
}

/** A proposed assignment is a plan; a confirmed one is a commitment. The grid shows the difference. */
export function cellTone(cell: PlannerCell | undefined): string {
  if (!cell?.personId) return 'text-muted-foreground/50';
  switch (cell.status) {
    case 'confirmed':
    case 'fulfilled':
      return 'text-foreground';
    case 'declined':
    case 'no_show':
      return 'text-destructive line-through';
    default:
      return 'text-muted-foreground';
  }
}

export function formatMeetingDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  });
}

export function formatMeetingDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
