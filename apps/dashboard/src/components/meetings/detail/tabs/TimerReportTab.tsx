'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Plus, RotateCcw, Square, Timer, X } from 'lucide-react';
import type { MeetingLiveRecord, MeetingRoleAssignment, SpeechSlot } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { submitAction } from '@/lib/toast';
import { MemberCombobox } from '../MemberCombobox';
import { useMemberName } from '../MembersContext';
import { EmptyState, TabSectionHeading } from '../primitives';

/**
 * Official Toastmasters timer-sheet flag times, per speech category.
 *   Prepared speech → 5:00 / 6:00 / 7:00
 *   Ice Breaker     → 4:00 / 5:00 / 6:00
 *   Table Topics    → 1:00 / 1:30 / 2:00
 *   Evaluations     → 2:00 / 2:30 / 3:00
 */
const CATEGORIES = [
  { key: 'preparedSpeaker', label: 'Prepared Speaker', green: 300, yellow: 360, red: 420 },
  { key: 'iceBreaker', label: 'Ice Breaker', green: 240, yellow: 300, red: 360 },
  { key: 'tableTopic', label: 'Table Topic', green: 60, yellow: 90, red: 120 },
  { key: 'preparedEvaluator', label: 'Speech Evaluator', green: 120, yellow: 150, red: 180 },
  { key: 'tableTopicEvaluator', label: 'TT Evaluator', green: 120, yellow: 150, red: 180 },
  { key: 'generalEvaluator', label: 'General Evaluator', green: 120, yellow: 150, red: 180 },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];
type Flag = 'none' | 'green' | 'yellow' | 'red';

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

function flagsFor(category: CategoryKey) {
  return CATEGORY_BY_KEY.get(category) ?? CATEGORIES[0];
}

function flagAt(seconds: number, category: CategoryKey): Flag {
  const { green, yellow, red } = flagsFor(category);
  if (seconds >= red) return 'red';
  if (seconds >= yellow) return 'yellow';
  if (seconds >= green) return 'green';
  return 'none';
}

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function short(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

type Entry = {
  id: string;
  /** Client-minted and stable, so a retry after a venue-wifi drop is idempotent (FR-MTG-6/NFR-3). */
  clientKey: string;
  label: string;
  personId: string | null;
  category: CategoryKey;
  elapsed: number;
  status: 'idle' | 'running' | 'paused' | 'stopped';
  recorded: boolean;
};

const PANEL_ACCENT: Record<Flag, string> = {
  none: 'bg-muted',
  green: 'bg-green-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
};
const CLOCK_COLOR: Record<Flag, string> = {
  none: 'text-foreground',
  green: 'text-green-600 dark:text-green-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
};

export function TimerReportTab({
  clubUnitId,
  meetingId,
  roleAssignments,
  speechSlots,
  liveRecords,
}: {
  clubUnitId: string;
  meetingId: string;
  roleAssignments: MeetingRoleAssignment[];
  speechSlots: SpeechSlot[];
  liveRecords: MeetingLiveRecord[];
}) {
  const router = useRouter();
  const memberName = useMemberName();

  /**
   * Seed the queue from the agenda: every approved speech slot, plus the
   * evaluator roles. The timer is the one tool that must work before anyone
   * has typed anything, so the list arrives pre-filled.
   */
  const seeded = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    speechSlots
      .filter((s) => s.status !== 'declined')
      .forEach((slot) => {
        out.push({
          id: `slot-${slot.id}`,
          clientKey: `timer-slot-${slot.id}`,
          label: slot.title || memberName(slot.requestedBy),
          personId: slot.requestedBy,
          category: slot.level === 1 ? 'iceBreaker' : 'preparedSpeaker',
          elapsed: 0,
          status: 'idle',
          recorded: false,
        });
      });
    roleAssignments
      .filter((a) => a.status !== 'declined' && a.assignee.kind !== 'unfilled')
      .forEach((assignment) => {
        const category: CategoryKey | null =
          assignment.roleKey === 'evaluator'
            ? 'preparedEvaluator'
            : assignment.roleKey === 'table_topics_evaluator'
              ? 'tableTopicEvaluator'
              : assignment.roleKey === 'general_evaluator'
                ? 'generalEvaluator'
                : null;
        if (!category) return;
        const personId =
          assignment.assignee.kind === 'member' || assignment.assignee.kind === 'cross_club'
            ? assignment.assignee.personId
            : null;
        out.push({
          id: `role-${assignment.id}`,
          clientKey: `timer-role-${assignment.id}`,
          label: memberName(personId),
          personId,
          category,
          elapsed: 0,
          status: 'idle',
          recorded: false,
        });
      });
    return out;
  }, [speechSlots, roleAssignments, memberName]);

  /**
   * Timer state is kept as *overrides* on top of the derived `seeded` list
   * rather than as a second copy of it. That way a change to the agenda
   * re-derives the queue during render — no effect copying props into state,
   * and no risk of a running timer being clobbered by a re-seed.
   */
  type Override = { elapsed: number; status: Entry['status']; recorded: boolean };
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [manual, setManual] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // The clock reads from state, never `Date.now()` during render, so a
  // render is pure and the displayed time only advances on a tick.
  const [now, setNow] = useState<number>(() => Date.now());
  const [adding, setAdding] = useState(false);

  const entries = useMemo<Entry[]>(
    () => [...seeded, ...manual].map((entry) => ({ ...entry, ...overrides[entry.id] })),
    [seeded, manual, overrides],
  );

  const activeId = selectedId ?? entries[0]?.id ?? null;

  useEffect(() => {
    if (runningId === null || startedAt === null) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [runningId, startedAt]);

  const liveElapsed = useCallback(
    (entry: Entry) =>
      entry.id === runningId && startedAt !== null
        ? entry.elapsed + Math.max(0, Math.floor((now - startedAt) / 1000))
        : entry.elapsed,
    [runningId, startedAt, now],
  );

  function patch(id: string, next: Partial<Override>) {
    setOverrides((prev) => {
      const current = prev[id] ?? { elapsed: 0, status: 'idle' as const, recorded: false };
      return { ...prev, [id]: { ...current, ...next } };
    });
  }

  /** Seconds accrued by the running entry since it was started. */
  function accrued(): number {
    return startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }

  function start() {
    if (!activeId) return;
    // Fold the outgoing timer's time back in before switching away from it.
    if (runningId !== null && runningId !== activeId) {
      const outgoing = entries.find((e) => e.id === runningId);
      if (outgoing) patch(runningId, { elapsed: outgoing.elapsed + accrued(), status: 'paused' });
    }
    patch(activeId, { status: 'running' });
    setRunningId(activeId);
    const startTime = Date.now();
    setStartedAt(startTime);
    setNow(startTime);
  }

  function pause() {
    if (runningId === null || startedAt === null) return;
    const entry = entries.find((e) => e.id === runningId);
    if (entry) patch(runningId, { elapsed: entry.elapsed + accrued(), status: 'paused' });
    setRunningId(null);
    setStartedAt(null);
  }

  function stop() {
    if (runningId === null) return;
    const entry = entries.find((e) => e.id === runningId);
    if (!entry) return;
    const finalElapsed = entry.elapsed + accrued();
    patch(runningId, { elapsed: finalElapsed, status: 'stopped' });
    setRunningId(null);
    setStartedAt(null);
    void recordEntry({ ...entry, elapsed: finalElapsed });
  }

  function reset(id: string) {
    if (runningId === id) {
      setRunningId(null);
      setStartedAt(null);
    }
    patch(id, { elapsed: 0, status: 'idle', recorded: false });
  }

  function removeEntry(id: string) {
    if (runningId === id) {
      setRunningId(null);
      setStartedAt(null);
    }
    if (selectedId === id) setSelectedId(null);
    // A seeded entry comes from the agenda, so it cannot be deleted here —
    // zero it instead; only manually added rows are actually removed.
    if (id.startsWith('manual-')) setManual((prev) => prev.filter((e) => e.id !== id));
    else patch(id, { elapsed: 0, status: 'idle', recorded: false });
  }

  function addManual(label: string, personId: string | null, category: CategoryKey) {
    const id = `manual-${crypto.randomUUID()}`;
    setManual((prev) => [
      ...prev,
      {
        id,
        clientKey: `timer-${id}`,
        label,
        personId,
        category,
        elapsed: 0,
        status: 'idle',
        recorded: false,
      },
    ]);
    setSelectedId(id);
    setAdding(false);
  }

  /**
   * Persist a finished timing as a `MeetingLiveRecord`. `clientKey` is
   * stable per entry, so a retry after a dropped connection replays to the
   * same row rather than creating a duplicate.
   */
  async function recordEntry(entry: Entry) {
    const result = await submitAction(
      () =>
        fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/live-records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'timer',
            clientKey: entry.clientKey,
            targetLabel: entry.label,
            payload: {
              category: flagsFor(entry.category).label,
              elapsedMs: entry.elapsed * 1000,
              signal:
                flagAt(entry.elapsed, entry.category) === 'none'
                  ? null
                  : flagAt(entry.elapsed, entry.category),
            },
          }),
        }),
      {
        loading: 'Saving timing…',
        success: 'Timing saved',
        error: 'Could not save that timing — press Stop again to retry.',
      },
    );
    if (!result) return;
    patch(entry.id, { recorded: true });
    router.refresh();
  }

  const selected = entries.find((e) => e.id === activeId) ?? null;
  const isRunning = runningId !== null && startedAt !== null;

  const groups = [
    {
      label: 'Prepared Speeches & Evaluations',
      items: entries.filter((e) =>
        ['preparedSpeaker', 'iceBreaker', 'preparedEvaluator'].includes(e.category),
      ),
    },
    {
      label: 'Table Topics',
      items: entries.filter((e) => ['tableTopic', 'tableTopicEvaluator'].includes(e.category)),
    },
    {
      label: 'General Evaluation',
      items: entries.filter((e) => e.category === 'generalEvaluator'),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Active timer panel */}
      {selected ? (
        <ActivePanel
          entry={selected}
          elapsed={liveElapsed(selected)}
          isRunning={isRunning && selected.id === runningId}
          onStart={start}
          onPause={pause}
          onStop={stop}
          onReset={() => reset(selected.id)}
        />
      ) : (
        <EmptyState
          title="No speaker selected"
          hint="Pick someone below, or add a speaker to start timing."
        />
      )}

      {adding ? (
        <AddEntryForm onAdd={addManual} onCancel={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add speaker
        </Button>
      )}

      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <TabSectionHeading>{group.label}</TabSectionHeading>
          {group.items.map((entry) => (
            <QueueCard
              key={entry.id}
              entry={entry}
              elapsed={liveElapsed(entry)}
              isSelected={entry.id === activeId}
              isRunning={isRunning && entry.id === runningId}
              onSelect={() => setSelectedId(entry.id)}
              onDelete={() => removeEntry(entry.id)}
            />
          ))}
        </section>
      ))}

      <SessionReport entries={entries} liveElapsed={liveElapsed} recorded={liveRecords} />
    </div>
  );
}

function FlagCard({
  color,
  label,
  time,
  active,
}: {
  color: 'green' | 'yellow' | 'red';
  label: string;
  time: number;
  active: boolean;
}) {
  const activeClass = {
    green: 'bg-green-500 text-white',
    yellow: 'bg-amber-400 text-black',
    red: 'bg-red-500 text-white',
  }[color];
  const idleClass = {
    green:
      'bg-green-50 border border-green-200 text-green-500 dark:bg-green-950/20 dark:border-green-800 dark:text-green-700',
    yellow:
      'bg-amber-50 border border-amber-200 text-amber-500 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-700',
    red: 'bg-red-50 border border-red-200 text-red-500 dark:bg-red-950/20 dark:border-red-800 dark:text-red-700',
  }[color];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl px-1 py-3 transition-all duration-500',
        active ? activeClass : idleClass,
      )}
    >
      <span className="mb-0.5 text-[10px] font-bold tracking-widest uppercase opacity-75">
        {label}
      </span>
      <span className="font-mono text-lg leading-none font-extrabold tabular-nums">
        {short(time)}
      </span>
    </div>
  );
}

function ActivePanel({
  entry,
  elapsed,
  isRunning,
  onStart,
  onPause,
  onStop,
  onReset,
}: {
  entry: Entry;
  elapsed: number;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const thresholds = flagsFor(entry.category);
  const flag = flagAt(elapsed, entry.category);
  const overtime = elapsed > thresholds.red;

  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
      <div className={cn('h-1.5 transition-colors duration-700', PANEL_ACCENT[flag])} />
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              {thresholds.label}
            </span>
            <p className="mt-1.5 truncate text-lg leading-snug font-bold sm:text-xl">
              {entry.label || '—'}
            </p>
          </div>
          {isRunning && (
            <span className="mt-1 flex size-2 shrink-0 rounded-full bg-green-500">
              <span className="inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
            </span>
          )}
        </div>

        <div className="my-2 text-center">
          <span
            className={cn(
              'font-mono text-[3.5rem] leading-none font-black tracking-tighter tabular-nums transition-colors duration-500 sm:text-[5.5rem]',
              CLOCK_COLOR[flag],
              overtime && isRunning && 'animate-pulse',
            )}
          >
            {clock(elapsed)}
          </span>
          {overtime && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              <span
                className={cn(
                  'inline-block size-1.5 rounded-full bg-white',
                  isRunning && 'animate-ping',
                )}
              />
              OVERTIME +{short(elapsed - thresholds.red)}
            </div>
          )}
        </div>

        <div className="mt-5 mb-5 grid grid-cols-3 gap-2">
          <FlagCard
            color="green"
            label="Green"
            time={thresholds.green}
            active={elapsed >= thresholds.green}
          />
          <FlagCard
            color="yellow"
            label="Yellow"
            time={thresholds.yellow}
            active={elapsed >= thresholds.yellow}
          />
          <FlagCard
            color="red"
            label="Red"
            time={thresholds.red}
            active={elapsed >= thresholds.red}
          />
        </div>

        <div className="flex flex-col gap-2">
          {isRunning ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full"
              onClick={onPause}
            >
              <Pause className="size-5" aria-hidden />
              Pause
            </Button>
          ) : (
            <Button type="button" size="lg" className="h-12 w-full" onClick={onStart}>
              <Play className="size-5" aria-hidden />
              {elapsed > 0 ? 'Resume' : 'Start'}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 flex-1"
              onClick={onStop}
              disabled={elapsed === 0 && !isRunning}
            >
              <Square className="size-4" aria-hidden />
              Stop &amp; record
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 flex-1 text-muted-foreground"
              onClick={onReset}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueCard({
  entry,
  elapsed,
  isSelected,
  isRunning,
  onSelect,
  onDelete,
}: {
  entry: Entry;
  elapsed: number;
  isSelected: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const thresholds = flagsFor(entry.category);
  const overtime = elapsed > thresholds.red;
  const statusLabel = isRunning
    ? 'Running'
    : entry.status === 'paused'
      ? 'Paused'
      : entry.status === 'stopped'
        ? entry.recorded
          ? 'Recorded'
          : 'Done'
        : '';

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 overflow-hidden rounded-xl border py-3 pr-2 pl-5 transition-all',
        isRunning
          ? 'border-green-400 bg-green-50 shadow-sm dark:bg-green-950/20'
          : isSelected
            ? 'border-primary/50 bg-primary/5 shadow-sm'
            : 'border-border hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1 transition-colors duration-500',
          isRunning ? 'bg-primary' : PANEL_ACCENT[flagAt(elapsed, entry.category)],
        )}
      />
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm leading-snug font-semibold">
          {entry.label || '—'}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{thresholds.label}</span>
      </button>
      <div className="shrink-0 text-right">
        {elapsed > 0 && (
          <p
            className={cn(
              'font-mono text-sm font-bold tabular-nums',
              overtime ? 'text-red-500' : 'text-foreground',
            )}
          >
            {short(elapsed)}
          </p>
        )}
        {statusLabel && (
          <p
            className={cn(
              'text-[10px] font-semibold',
              isRunning ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {statusLabel}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${entry.label}`}
        className="shrink-0 text-muted-foreground/50 hover:text-destructive"
        onClick={onDelete}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function AddEntryForm({
  onAdd,
  onCancel,
}: {
  onAdd: (label: string, personId: string | null, category: CategoryKey) => void;
  onCancel: () => void;
}) {
  const memberName = useMemberName();
  const [personId, setPersonId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState('');
  const [category, setCategory] = useState<CategoryKey>('preparedSpeaker');

  const label = personId ? memberName(personId) : freeText.trim();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as CategoryKey)}
        aria-label="Speech type"
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      <MemberCombobox value={personId} onChange={setPersonId} placeholder="Pick a member…" />

      {!personId && (
        <Input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="…or type a name (guest, visitor)"
        />
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={!label}
          onClick={() => onAdd(label, personId, category)}
        >
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SessionReport({
  entries,
  liveElapsed,
  recorded,
}: {
  entries: Entry[];
  liveElapsed: (entry: Entry) => number;
  recorded: MeetingLiveRecord[];
}) {
  const timed = entries.filter((e) => liveElapsed(e) > 0);
  const savedCount = recorded.filter((r) => r.kind === 'timer').length;
  if (timed.length === 0 && savedCount === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <TabSectionHeading>Session Report</TabSectionHeading>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="py-2.5 pr-2 pl-4 text-left text-xs font-semibold">Speaker</th>
              <th className="hidden px-2 py-2.5 text-left text-xs font-semibold sm:table-cell">
                Type
              </th>
              <th className="px-2 py-2.5 text-right text-xs font-semibold">Time</th>
              <th className="py-2.5 pr-4 pl-2 text-right text-xs font-semibold">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {timed.map((entry) => {
              const elapsed = liveElapsed(entry);
              const thresholds = flagsFor(entry.category);
              const flag = flagAt(elapsed, entry.category);
              const overtime = elapsed > thresholds.red;
              return (
                <tr key={entry.id} className="hover:bg-muted/20">
                  <td className="py-2.5 pr-2 pl-4 font-medium">{entry.label}</td>
                  <td className="hidden px-2 py-2.5 text-xs text-muted-foreground sm:table-cell">
                    {thresholds.label}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right font-mono font-bold tabular-nums',
                      overtime && 'text-red-500',
                    )}
                  >
                    {short(elapsed)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-4 pl-2 text-right text-xs',
                      overtime
                        ? 'font-semibold text-red-500'
                        : flag === 'none'
                          ? 'text-muted-foreground'
                          : flag === 'green'
                            ? 'text-green-600'
                            : flag === 'yellow'
                              ? 'text-amber-600'
                              : 'text-red-600',
                    )}
                  >
                    {overtime
                      ? `Over +${short(elapsed - thresholds.red)}`
                      : flag === 'none'
                        ? 'Under time'
                        : 'On time'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="size-3" aria-hidden />
        {savedCount} timing{savedCount === 1 ? '' : 's'} saved to this meeting&apos;s record.
      </p>
    </section>
  );
}
