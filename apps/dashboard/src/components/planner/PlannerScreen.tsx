'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  ClubMemberSummary,
  CreateMeetingRoleAssignmentRequest,
  Guest,
  MeetingRoleKey,
  PlannerCell,
  PlannerRow,
} from '@toastmasters/contracts';
import { CalendarRangeIcon, CircleAlertIcon, Loader2, Plus, UploadIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PersonPicker, type PickerSelection } from './PersonPicker';
import { PlannerImportDialog } from './PlannerImportDialog';
import {
  PLANNER_COLUMNS,
  cellFor,
  cellTone,
  formatMeetingDate,
  formatMeetingDateLong,
} from './columns';

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  programYearId,
}: {
  clubUnitId: string;
  rows: PlannerRow[];
  members: ClubMemberSummary[];
  guests: Guest[];
  programYearId: string | null;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);

  const unfilled = rows.reduce(
    (total, row) =>
      total +
      PLANNER_COLUMNS.filter((c) => !cellFor(row, c.roleKey, c.slotIndex)?.assignmentId).length,
    0,
  );

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-12 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0
              ? 'No meetings scheduled in this window'
              : `${rows.length} meeting${rows.length === 1 ? '' : 's'} · ${unfilled} role${unfilled === 1 ? '' : 's'} unfilled`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <UploadIcon />
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button onClick={() => setAddRowOpen(true)} disabled={!programYearId}>
            <Plus />
            <span className="hidden sm:inline">Add row</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
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
              Add row
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <UploadIcon />
              Import CSV
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Wide screens: the spreadsheet shape clubs already think in. */}
          <div className="hidden overflow-x-auto rounded-xl border lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2.5 text-left font-medium whitespace-nowrap">
                    Date / Theme
                  </th>
                  {PLANNER_COLUMNS.map((column) => (
                    <th
                      key={cellKey(column.roleKey, column.slotIndex)}
                      title={column.label}
                      className="px-3 py-2.5 text-left font-medium whitespace-nowrap"
                    >
                      {column.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PlannerRowGrid
                    key={row.meetingId}
                    row={row}
                    clubUnitId={clubUnitId}
                    members={members}
                    guests={guests}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per meeting. A 13-column table behind a
              horizontal scroll is unreadable on a 390px screen. */}
          <div className="flex flex-col gap-3 lg:hidden">
            {rows.map((row) => (
              <PlannerRowCard
                key={row.meetingId}
                row={row}
                clubUnitId={clubUnitId}
                members={members}
                guests={guests}
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

/** One row in the desktop grid. Cells and theme are editable in place. */
function PlannerRowGrid({
  row,
  clubUnitId,
  members,
  guests,
}: {
  row: PlannerRow;
  clubUnitId: string;
  members: ClubMemberSummary[];
  guests: Guest[];
}) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-background px-3 py-2.5 text-left font-medium align-top"
      >
        <Link
          href={`/clubs/${clubUnitId}/meetings/${row.meetingId}`}
          className="whitespace-nowrap hover:underline"
        >
          {formatMeetingDate(row.scheduledAt)}
        </Link>
        <ThemeInput clubUnitId={clubUnitId} meetingId={row.meetingId} initial={row.theme} />
      </th>
      {PLANNER_COLUMNS.map((column) => {
        const cell = cellFor(row, column.roleKey, column.slotIndex);
        return (
          <td
            key={cellKey(column.roleKey, column.slotIndex)}
            className={cn('px-3 py-2 align-top whitespace-nowrap', cellTone(cell))}
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
    </tr>
  );
}

/** One row in the phone layout. */
function PlannerRowCard({
  row,
  clubUnitId,
  members,
  guests,
}: {
  row: PlannerRow;
  clubUnitId: string;
  members: ClubMemberSummary[];
  guests: Guest[];
}) {
  const missing = PLANNER_COLUMNS.filter(
    (c) => !cellFor(row, c.roleKey, c.slotIndex)?.assignmentId,
  ).length;

  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-2 border-b bg-muted/30 px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/clubs/${clubUnitId}/meetings/${row.meetingId}`}
            className="min-w-0 font-medium hover:underline"
          >
            {formatMeetingDateLong(row.scheduledAt)}
          </Link>
          {missing > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <CircleAlertIcon className="size-3.5" />
              {missing}
            </span>
          )}
        </div>
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
    <div className="flex flex-col gap-1">
      <PersonPicker
        value={value}
        onChange={change}
        members={members}
        guests={guests}
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

/** Blur-to-save theme input. Stays uncontrolled to avoid a keystroke-per-render loop. */
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
        className="mt-1 block w-full max-w-[240px] rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-normal text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:border-input focus:border-input focus:bg-background focus:text-foreground"
      />
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
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
            Add row
          </Button>
        </div>
      </div>
    </div>
  );
}
