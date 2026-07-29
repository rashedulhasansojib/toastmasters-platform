'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Users } from 'lucide-react';
import type { MeetingAttendanceRosterEntry } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '../primitives';

/**
 * Member headcount.
 *
 * Attendance is append-only (NFR-4), so every toggle POSTs a *new*
 * record rather than patching one — the tap still feels like a switch, but
 * the history is intact and the DB has UPDATE/DELETE revoked on the table.
 * `recordedAt === null` means nobody has marked this member yet, which the
 * roster shows as "not taken" rather than as absent.
 */
export function AttendanceTab({
  clubUnitId,
  meetingId,
  roster,
}: {
  clubUnitId: string;
  meetingId: string;
  roster: MeetingAttendanceRosterEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Reflect the tap immediately; the server round-trip reconciles on refresh.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const presentOf = (entry: MeetingAttendanceRosterEntry) =>
    optimistic[entry.personId] ?? entry.present;

  const present = roster.filter(presentOf).length;
  const untaken = roster.filter(
    (r) => r.recordedAt === null && optimistic[r.personId] === undefined,
  ).length;

  function record(entries: { personId: string; present: boolean }[]) {
    if (entries.length === 0) return;
    setOptimistic((prev) => {
      const next = { ...prev };
      for (const entry of entries) next[entry.personId] = entry.present;
      return next;
    });
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        setError('Could not save attendance — try again.');
        setOptimistic({});
        return;
      }
      router.refresh();
    });
  }

  function markAll(value: boolean) {
    record(roster.map((entry) => ({ personId: entry.personId, present: value })));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Attendance Headcount</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mark who showed up. Corrections are recorded, never overwritten.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-xs text-muted-foreground">{roster.length} on roster</span>
          {roster.length > 0 && (
            <span className="text-xs font-medium text-green-600 dark:text-green-500">
              {present} present
            </span>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {roster.length === 0 ? (
        <EmptyState
          title="No members on the roster"
          hint="Attendance lists the club's active members. Add members to the club first."
        />
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => markAll(true)}
              disabled={isPending}
            >
              <Users className="size-3.5" aria-hidden />
              Mark all present
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => markAll(false)}
              disabled={isPending}
            >
              Mark all absent
            </Button>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {roster.map((entry) => {
              const isPresent = presentOf(entry);
              const notTaken =
                entry.recordedAt === null && optimistic[entry.personId] === undefined;
              return (
                <li key={entry.personId}>
                  <button
                    type="button"
                    onClick={() => record([{ personId: entry.personId, present: !isPresent }])}
                    disabled={isPending}
                    aria-pressed={isPresent}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                      isPresent ? 'bg-green-50/50 dark:bg-green-950/20' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.fullName}</span>
                      {notTaken && (
                        <span className="text-xs text-muted-foreground">Not taken yet</span>
                      )}
                    </span>
                    {isPresent ? (
                      <CheckCircle2
                        className="size-5 shrink-0 text-green-600 dark:text-green-500"
                        aria-hidden
                      />
                    ) : (
                      <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {untaken > 0 && (
            <p className="text-xs text-muted-foreground">
              {untaken} member{untaken === 1 ? '' : 's'} not marked yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
