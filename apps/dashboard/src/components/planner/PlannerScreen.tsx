'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AgendaTemplate,
  ClubMemberSummary,
  CreateMeetingRoleAssignmentRequest,
  Guest,
  MeetingRoleKey,
  MeetingStatus,
  PlannerCell,
  PlannerRow,
} from '@toastmasters/contracts';
import {
  CalendarRangeIcon,
  CircleAlertIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2,
  PlayIcon,
  Plus,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PersonPicker, type PickerSelection } from './PersonPicker';
import { PlannerImportDialog } from './PlannerImportDialog';
import { PLANNER_COLUMNS, cellFor, cellTone, formatMeetingDateLong } from './columns';
import { downloadPlannerTemplate } from './csv';

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` for an `<input type="date">`, in the viewer's local zone. */
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Rebuild an ISO instant from a `YYYY-MM-DD` picked in the local zone,
 * preserving the meeting's original time-of-day and offset.
 * The user is moving the meeting to a different day, not rewriting its time.
 */
function replaceDatePart(iso: string, dateInput: string): string {
  const [y, m, d] = dateInput.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const src = new Date(iso);
  const next = new Date(src);
  next.setFullYear(y, m - 1, d);
  return next.toISOString();
}

/** Same cell key everywhere — `slotIndex` may legitimately be null (single-holder roles). */
function cellKey(roleKey: MeetingRoleKey, slotIndex: number | null): string {
  return `${roleKey}:${slotIndex ?? 'null'}`;
}

function pickerValueFromCell(cell: PlannerCell | undefined): PickerSelection | null {
  if (!cell) return null;
  if (cell.kind === 'member' || cell.kind === 'cross_club') {
    return cell.personId
      ? { kind: 'member', personId: cell.personId, fullName: cell.fullName ?? '' }
      : null;
  }
  if (cell.kind === 'guest') {
    return cell.guestId
      ? { kind: 'guest', guestId: cell.guestId, fullName: cell.fullName ?? '' }
      : null;
  }
  return null;
}

function toCreateAssignee(
  selection: PickerSelection,
): CreateMeetingRoleAssignmentRequest['assignee'] {
  if (selection.kind === 'member') return { kind: 'member', personId: selection.personId };
  return { kind: 'guest', guestId: selection.guestId };
}

/**
 * A row's temporal position, ported from the legacy portal. `past` fades the
 * row to signal it's history; `next` highlights the first upcoming meeting
 * in amber (with a dot before its date) so the user's eye lands there first;
 * `upcoming` is the default. This is a display-only concern — the API still
 * returns every row in the window.
 */
type RowStatus = 'past' | 'next' | 'upcoming';

function computeRowStatuses(rows: PlannerRow[]): Map<string, RowStatus> {
  const today = todayISO();
  const upcoming = rows
    .filter((r) => toDateInputValue(r.scheduledAt) >= today)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const nextId = upcoming[0]?.meetingId ?? null;
  return new Map(
    rows.map((row) => {
      const d = toDateInputValue(row.scheduledAt);
      if (d < today) return [row.meetingId, 'past'] as const;
      if (row.meetingId === nextId) return [row.meetingId, 'next'] as const;
      return [row.meetingId, 'upcoming'] as const;
    }),
  );
}

/**
 * FR-MTG-5's multi-week planner. Thirteen role columns cannot be a table on a
 * phone, so the two breakpoints show genuinely different shapes rather than
 * one shape squeezed: a real grid from `lg:` up, and one card per meeting
 * below it, where the roles become a two-column list you scroll vertically.
 *
 * Every cell is an interactive PersonPicker that can assign a member or a
 * guest — writes go through the existing `meeting.role` endpoints, because
 * §9.2 forbids a second write surface for role assignments. Theme is
 * blur-to-save via the meeting PATCH endpoint; row add creates a Meeting.
 */
export function PlannerScreen({
  clubUnitId,
  rows,
  members,
  guests,
  agendaTemplates,
  programYearId,
}: {
  clubUnitId: string;
  rows: PlannerRow[];
  members: ClubMemberSummary[];
  guests: Guest[];
  agendaTemplates: AgendaTemplate[];
  programYearId: string | null;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);

  // A cancelled meeting is history — not part of the plan any more. The row
  // still exists in the DB (§ CLAUDE.md's append-only rule); the planner just
  // hides it from the projection.
  const activeRows = rows.filter((row) => row.status !== 'cancelled');
  const statuses = computeRowStatuses(activeRows);
  const unfilled = activeRows.reduce(
    (total, row) =>
      total +
      PLANNER_COLUMNS.filter((c) => !cellFor(row, c.roleKey, c.slotIndex)?.assignmentId).length,
    0,
  );

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-12 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeRows.length === 0
              ? 'Role assignments for upcoming meetings'
              : `${activeRows.length} meeting${activeRows.length === 1 ? '' : 's'} · ${unfilled} role${unfilled === 1 ? '' : 's'} unfilled`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadPlannerTemplate}>
            <DownloadIcon />
            <span className="hidden sm:inline">Template</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <UploadIcon />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={() => setAddRowOpen(true)} disabled={!programYearId}>
            <Plus />
            <span className="hidden sm:inline">Add Row</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </header>

      {/* Legend — matches the legacy portal's row-state key, so the amber
          highlight in the grid below isn't unexplained. */}
      {activeRows.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-amber-500" />
            Next meeting
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm border border-border/60 bg-muted/40 opacity-60" />
            Past
          </span>
        </div>
      )}

      {activeRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRangeIcon className="size-5 text-muted-foreground" />
          </div>
          <p className="font-medium">Nothing planned yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add a meeting date, or import a season from a spreadsheet.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => setAddRowOpen(true)} disabled={!programYearId}>
              <Plus />
              Add Row
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <UploadIcon />
              Import
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Wide screens: the spreadsheet shape clubs already think in. */}
          <div className="hidden overflow-x-auto rounded-xl border lg:block">
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left whitespace-nowrap border-r border-border">
                    Date
                  </th>
                  {PLANNER_COLUMNS.map((column) => (
                    <th
                      key={cellKey(column.roleKey, column.slotIndex)}
                      title={column.label}
                      className="px-3 py-2 text-left whitespace-nowrap"
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left whitespace-nowrap">Theme</th>
                  <th
                    scope="col"
                    className="sticky right-0 z-10 w-32 bg-muted/50 px-3 py-2 text-right whitespace-nowrap border-l border-border"
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row) => (
                  <PlannerRowGrid
                    key={row.meetingId}
                    row={row}
                    rowStatus={statuses.get(row.meetingId) ?? 'upcoming'}
                    clubUnitId={clubUnitId}
                    members={members}
                    guests={guests}
                    agendaTemplates={agendaTemplates}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per meeting. A 13-column table behind a
              horizontal scroll is unreadable on a 390px screen. */}
          <div className="flex flex-col gap-3 lg:hidden">
            {activeRows.map((row) => (
              <PlannerRowCard
                key={row.meetingId}
                row={row}
                rowStatus={statuses.get(row.meetingId) ?? 'upcoming'}
                clubUnitId={clubUnitId}
                members={members}
                guests={guests}
                agendaTemplates={agendaTemplates}
              />
            ))}
          </div>
        </>
      )}

      <PlannerImportDialog clubUnitId={clubUnitId} open={importOpen} onOpenChange={setImportOpen} />

      {addRowOpen && programYearId && (
        <AddRowDialog
          clubUnitId={clubUnitId}
          programYearId={programYearId}
          onClose={() => setAddRowOpen(false)}
        />
      )}
    </div>
  );
}

/** One row in the desktop grid. Every cell is edited in place. */
function PlannerRowGrid({
  row,
  rowStatus,
  clubUnitId,
  members,
  guests,
  agendaTemplates,
}: {
  row: PlannerRow;
  rowStatus: RowStatus;
  clubUnitId: string;
  members: ClubMemberSummary[];
  guests: Guest[];
  agendaTemplates: AgendaTemplate[];
}) {
  const isPast = rowStatus === 'past';
  const isNext = rowStatus === 'next';

  return (
    <tr
      className={cn(
        'border-b transition-colors group last:border-0',
        isPast && 'opacity-50',
        isNext && 'bg-amber-50/60 dark:bg-amber-950/20',
        !isPast && !isNext && 'hover:bg-muted/20',
      )}
    >
      <th
        scope="row"
        className={cn(
          'sticky left-0 z-10 px-2 py-1.5 text-left align-middle font-normal border-r border-border',
          isNext ? 'bg-amber-50/95 dark:bg-amber-950/40' : 'bg-inherit',
        )}
      >
        <div className="flex items-center gap-1.5">
          {isNext && (
            <span
              className="inline-block size-1.5 shrink-0 rounded-full bg-amber-500"
              aria-hidden
            />
          )}
          <DateInput
            clubUnitId={clubUnitId}
            meetingId={row.meetingId}
            scheduledAt={row.scheduledAt}
            status={row.status}
            isNext={isNext}
            isPast={isPast}
          />
        </div>
      </th>
      {PLANNER_COLUMNS.map((column) => {
        const cell = cellFor(row, column.roleKey, column.slotIndex);
        return (
          <td
            key={cellKey(column.roleKey, column.slotIndex)}
            className={cn('px-2 py-1.5 align-middle', cellTone(cell))}
          >
            <CellPicker
              clubUnitId={clubUnitId}
              meetingId={row.meetingId}
              roleKey={column.roleKey}
              slotIndex={column.slotIndex}
              cell={cell}
              members={members}
              guests={guests}
            />
          </td>
        );
      })}
      <td className="px-2 py-1.5 align-middle">
        <ThemeInput clubUnitId={clubUnitId} meetingId={row.meetingId} initial={row.theme} />
      </td>
      <td
        className={cn(
          'sticky right-0 z-10 px-2 py-1.5 align-middle text-right border-l border-border',
          isNext ? 'bg-amber-50/95 dark:bg-amber-950/40' : 'bg-inherit',
        )}
      >
        <RowActions
          clubUnitId={clubUnitId}
          meetingId={row.meetingId}
          status={row.status}
          agendaTemplates={agendaTemplates}
        />
      </td>
    </tr>
  );
}

/** One row in the phone layout. */
function PlannerRowCard({
  row,
  rowStatus,
  clubUnitId,
  members,
  guests,
  agendaTemplates,
}: {
  row: PlannerRow;
  rowStatus: RowStatus;
  clubUnitId: string;
  members: ClubMemberSummary[];
  guests: Guest[];
  agendaTemplates: AgendaTemplate[];
}) {
  const missing = PLANNER_COLUMNS.filter(
    (c) => !cellFor(row, c.roleKey, c.slotIndex)?.assignmentId,
  ).length;
  const isPast = rowStatus === 'past';
  const isNext = rowStatus === 'next';

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-card transition-colors',
        isPast && 'opacity-60',
        isNext && 'border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20',
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-2 border-b px-3.5 py-2.5',
          isNext ? 'bg-amber-100/50 dark:bg-amber-950/30' : 'bg-muted/30',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {isNext && (
              <span
                className="inline-block size-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
            )}
            <DateInput
              clubUnitId={clubUnitId}
              meetingId={row.meetingId}
              scheduledAt={row.scheduledAt}
              status={row.status}
              isNext={isNext}
              isPast={isPast}
            />
          </div>
          <p className="mt-0.5 pl-3 text-xs text-muted-foreground">
            {formatMeetingDateLong(row.scheduledAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {missing > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CircleAlertIcon className="size-3.5" />
              {missing}
            </span>
          )}
          <RowActions
            clubUnitId={clubUnitId}
            meetingId={row.meetingId}
            status={row.status}
            agendaTemplates={agendaTemplates}
          />
        </div>
      </div>
      <div className="border-b px-3.5 py-2">
        <p className="mb-1 text-xs text-muted-foreground">Theme</p>
        <ThemeInput clubUnitId={clubUnitId} meetingId={row.meetingId} initial={row.theme} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-3.5 py-3 text-sm">
        {PLANNER_COLUMNS.map((column) => {
          const cell = cellFor(row, column.roleKey, column.slotIndex);
          return (
            <div key={cellKey(column.roleKey, column.slotIndex)} className="min-w-0">
              <dt className="mb-1 truncate text-xs text-muted-foreground">{column.label}</dt>
              <dd>
                <CellPicker
                  clubUnitId={clubUnitId}
                  meetingId={row.meetingId}
                  roleKey={column.roleKey}
                  slotIndex={column.slotIndex}
                  cell={cell}
                  members={members}
                  guests={guests}
                />
              </dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}

/**
 * One cell. Reads its own selection from the incoming `cell` (source of truth
 * is the server-rendered `row`), and after a successful write calls
 * `router.refresh()` so the next server render carries the updated grid.
 */
function CellPicker({
  clubUnitId,
  meetingId,
  roleKey,
  slotIndex,
  cell,
  members,
  guests,
}: {
  clubUnitId: string;
  meetingId: string;
  roleKey: MeetingRoleKey;
  slotIndex: number | null;
  cell: PlannerCell | undefined;
  members: ClubMemberSummary[];
  guests: Guest[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = pickerValueFromCell(cell);

  async function change(next: PickerSelection | null) {
    setSaving(true);
    setError(null);
    try {
      // Clear: withdraw any existing proposed assignment on this slot.
      if (!next) {
        if (!cell?.assignmentId) return;
        const del = await fetch(
          `/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/${cell.assignmentId}`,
          { method: 'DELETE' },
        );
        if (!del.ok) {
          setError('Could not clear the slot.');
          return;
        }
        router.refresh();
        return;
      }

      // Replace: withdraw first, then create — only valid on a still-proposed
      // slot. A confirmed/fulfilled slot is history and must be superseded
      // via the meeting page's status controls (see meeting-role-assignment
      // controller's 409). The planner surfaces that as a saving error.
      if (cell?.assignmentId) {
        const del = await fetch(
          `/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/${cell.assignmentId}`,
          { method: 'DELETE' },
        );
        if (!del.ok) {
          setError('This slot is already confirmed — change it on the meeting page.');
          return;
        }
      }

      const body: CreateMeetingRoleAssignmentRequest = {
        roleKey,
        ...(slotIndex !== null ? { slotIndex } : {}),
        assignee: toCreateAssignee(next),
      };
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError('Could not assign that person.');
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-[9rem] flex-col gap-1">
      <PersonPicker
        value={value}
        onChange={change}
        members={members}
        guests={guests}
        placeholder="—"
        disabled={saving}
        className={cn(saving && 'opacity-70')}
      />
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

/** Blur-to-save theme input. Same bordered shape as the role cells so a row reads as one strip. */
function ThemeInput({
  clubUnitId,
  meetingId,
  initial,
}: {
  clubUnitId: string;
  meetingId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>(initial ?? '');

  async function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (initial ?? '').trim()) return;
    setError(null);
    const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: trimmed === '' ? null : trimmed }),
    });
    if (!res.ok) {
      setError('Could not save theme.');
      return;
    }
    router.refresh();
  }

  return (
    <>
      <input
        type="text"
        value={current}
        placeholder="Theme…"
        maxLength={200}
        onChange={(e) => setCurrent(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label="Meeting theme"
        className="h-8 w-full min-w-[10rem] rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-accent focus:ring-1 focus:ring-ring"
      />
      {error && (
        <span role="alert" className="mt-0.5 block text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}

/**
 * Blur-to-save date input. Editing preserves the meeting's time-of-day —
 * the user is rescheduling to a different day, not rewriting the hour.
 * Disabled once the meeting is `in_progress` or `closed`: at that point the
 * date is history, not plan (rescheduling would rewrite what actually
 * happened). Amber-bordered when this is the next meeting, muted when past.
 */
function DateInput({
  clubUnitId,
  meetingId,
  scheduledAt,
  status,
  isNext,
  isPast,
}: {
  clubUnitId: string;
  meetingId: string;
  scheduledAt: string;
  status: MeetingStatus;
  isNext: boolean;
  isPast: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const initial = toDateInputValue(scheduledAt);
  const [current, setCurrent] = useState(initial);

  const locked = status === 'in_progress' || status === 'closed';

  function commit(nextDate: string) {
    if (!nextDate || nextDate === initial) {
      setCurrent(initial);
      return;
    }
    setError(null);
    const nextIso = replaceDatePart(scheduledAt, nextDate);
    startTransition(async () => {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: nextIso }),
      });
      if (!res.ok) {
        setError('Could not move the meeting.');
        setCurrent(initial);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <input
        type="date"
        value={current}
        disabled={locked || pending}
        onChange={(e) => setCurrent(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label="Meeting date"
        className={cn(
          'h-8 w-[130px] rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus:ring-1 focus:ring-ring',
          isNext && 'border-amber-400 font-medium',
          isPast && 'text-muted-foreground',
          locked && 'cursor-not-allowed opacity-70',
        )}
      />
      {error && (
        <span role="alert" className="mt-0.5 block text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}

/**
 * Row actions — apply an agenda template (Play), open the meeting page for
 * deeper edits (Open), or cancel the meeting (Delete).
 *
 * Play calls `POST /agenda-items/from-template`, appending the template's
 * items to *this* meeting's agenda — matching the user ask that the agenda
 * be created ON the meeting, not on a separate printable page. If the club
 * has exactly one active template we apply it directly; more than one and
 * we open a small picker so the user chooses. No templates means Play is
 * disabled with an explanatory tooltip.
 *
 * `Delete` in the DB sense would break §CLAUDE.md's append-only invariant;
 * `cancel` sets the status to `cancelled` and the planner filters it out
 * on the next render. History and role assignments are preserved.
 */
function RowActions({
  clubUnitId,
  meetingId,
  status,
  agendaTemplates,
}: {
  clubUnitId: string;
  meetingId: string;
  status: MeetingStatus;
  agendaTemplates: AgendaTemplate[];
}) {
  const router = useRouter();
  // One state variable, not one useTransition per button — so a spinner
  // only shows on the icon whose action is actually in flight. `busy` also
  // guards the sibling buttons against concurrent clicks.
  const [busy, setBusy] = useState<'play' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const canCancel = status === 'draft' || status === 'published';
  const canApplyAgenda = status === 'draft' || status === 'published';

  const playTitle =
    agendaTemplates.length === 0
      ? 'Create an agenda template first (Meetings › Agenda templates)'
      : !canApplyAgenda
        ? 'The meeting has already started or closed'
        : agendaTemplates.length === 1
          ? `Apply agenda template "${agendaTemplates[0].name}"`
          : 'Choose an agenda template to apply';
  const playDisabled = busy !== null || !canApplyAgenda || agendaTemplates.length === 0;
  const cancelDisabled = busy !== null || !canCancel;

  async function applyTemplate(templateId: string) {
    setError(null);
    setBusy('play');
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/agenda-items/from-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId }),
        },
      );
      if (!res.ok) {
        setError('Could not create the agenda.');
        return;
      }
      setPickerOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function play() {
    if (playDisabled) return;
    if (agendaTemplates.length === 1) {
      void applyTemplate(agendaTemplates[0].id);
      return;
    }
    setPickerOpen(true);
  }

  async function cancel() {
    if (cancelDisabled) return;
    if (
      !confirm(
        'Cancel this meeting? It will be marked as cancelled and hidden from the planner. History and role assignments are preserved.',
      )
    ) {
      return;
    }
    setError(null);
    setBusy('cancel');
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError('Could not cancel.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={play}
        disabled={playDisabled}
        aria-label="Create agenda from template"
        title={playTitle}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
          playDisabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-primary/10 hover:text-primary',
        )}
      >
        {busy === 'play' ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </button>
      <a
        href={`/clubs/${clubUnitId}/meetings/${meetingId}`}
        aria-label="Open meeting"
        title="Open meeting"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ExternalLinkIcon className="size-4" />
      </a>
      <button
        type="button"
        onClick={cancel}
        disabled={cancelDisabled}
        aria-label="Cancel meeting"
        title={canCancel ? 'Cancel meeting' : 'Cannot cancel a meeting that has started or closed'}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
          canCancel
            ? 'hover:bg-destructive/10 hover:text-destructive'
            : 'cursor-not-allowed opacity-40',
        )}
      >
        {busy === 'cancel' ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2Icon className="size-4" />
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}

      {pickerOpen && (
        <TemplatePickerDialog
          templates={agendaTemplates}
          pending={busy === 'play'}
          onApply={(id) => {
            void applyTemplate(id);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/** Small modal — only reached when the club has more than one active template. */
function TemplatePickerDialog({
  templates,
  pending,
  onApply,
  onClose,
}: {
  templates: AgendaTemplate[];
  pending: boolean;
  onApply: (templateId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="planner-agenda-template-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-t-2xl border border-border bg-background p-5 shadow-xl sm:rounded-xl">
        <h2 id="planner-agenda-template-title" className="text-base font-semibold">
          Create agenda from template
        </h2>
        <p className="text-xs text-muted-foreground">
          Appends the template&apos;s items to this meeting&apos;s agenda. Existing items stay put.
        </p>
        <ul className="flex flex-col gap-1.5">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => onApply(template.id)}
                disabled={pending}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{template.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {template.items.length} item{template.items.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Minimal "add a meeting" dialog. The full New Meeting Dialog on the
 * meetings page is heavier (templates, meeting number, start time defaults);
 * planner adds are quick — just pick a date, drop into the row, edit inline.
 */
function AddRowDialog({
  clubUnitId,
  programYearId,
  onClose,
}: {
  clubUnitId: string;
  programYearId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('19:00');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    if (!date || !startTime) {
      setError('Pick a date and a start time.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const scheduledAt = new Date(`${date}T${startTime}:00`).toISOString();
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programYearId, scheduledAt }),
      });
      if (!res.ok) {
        setError('Could not create the meeting.');
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="planner-add-row-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-t-2xl border border-border bg-background p-5 shadow-xl sm:rounded-xl">
        <h2 id="planner-add-row-title" className="text-base font-semibold">
          Add planner row
        </h2>
        <p className="text-xs text-muted-foreground">
          Creates an empty meeting on this date. You can fill in roles and theme right after.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="planner-add-date" className="text-xs text-muted-foreground">
              Date
            </Label>
            <Input
              id="planner-add-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="planner-add-time" className="text-xs text-muted-foreground">
              Start time
            </Label>
            <Input
              id="planner-add-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Add Row
          </Button>
        </div>
      </div>
    </div>
  );
}
