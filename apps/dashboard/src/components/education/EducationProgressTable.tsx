'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Lock, Search } from 'lucide-react';
import type {
  ClubEducationProgressLevel,
  ClubEducationProgressRow,
  PathwayPath,
} from '@toastmasters/contracts';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MemberPathwayPanel } from './MemberPathwayPanel';

const LEVELS = [1, 2, 3, 4, 5];

type SortKey = 'name' | 'path';
type SortDir = 'asc' | 'desc';

/**
 * A confirmed level, a fraction, or a dash.
 *
 * "—" means the seeded catalogue defines no projects at this level of this
 * path — a gap in reference data, not a member who has done nothing. Showing
 * "0 of 0" there would read as the latter, so the two states stay distinct.
 */
function LevelCell({ level }: { level: ClubEducationProgressLevel }) {
  if (level.vpeConfirmedAt) {
    return (
      <span
        className="inline-flex size-6 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
        title={`Confirmed ${new Date(level.vpeConfirmedAt).toLocaleDateString()}`}
      >
        <Check className="size-3.5" aria-hidden />
        <span className="sr-only">Level {level.level} confirmed</span>
      </span>
    );
  }

  if (level.required === 0) {
    return (
      <span
        className="text-muted-foreground/60"
        title="No projects seeded in the Pathways catalogue for this level yet"
      >
        —
      </span>
    );
  }

  const awaiting = level.memberMarkedCompleteAt !== null;
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap tabular-nums',
        awaiting
          ? 'bg-amber-100 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : 'text-muted-foreground',
      )}
      title={awaiting ? 'Marked complete by the member — awaiting VPE confirmation' : undefined}
    >
      {level.delivered} of {level.required}
    </span>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-foreground"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className={cn('size-3', active ? 'text-foreground' : 'text-muted-foreground/60')} />
    </button>
  );
}

/**
 * The club's education roster: one row per member per path, with the Name
 * column pinned so the level columns can scroll horizontally on a phone
 * without losing track of whose row it is.
 *
 * `rows === null` means the caller has no `education.progress: read` grant —
 * the club-wide view is officer-only, so say that rather than render an
 * empty club.
 */
export function EducationProgressTable({
  rows,
  pathways,
}: {
  rows: ClubEducationProgressRow[] | null;
  pathways: PathwayPath[];
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<ClubEducationProgressRow | null>(null);

  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? rows.filter(
          (row) =>
            row.fullName.toLowerCase().includes(needle) ||
            (row.pathName ?? '').toLowerCase().includes(needle),
        )
      : rows;

    const sorted = [...filtered].sort((a, b) => {
      const left = sortKey === 'name' ? a.fullName : (a.pathName ?? '');
      const right = sortKey === 'name' ? b.fullName : (b.pathName ?? '');
      // Members without a path sort last regardless of direction — they are
      // the ones a VPE wants to find, not the ones to bury under Z.
      if (sortKey === 'path' && left === '') return 1;
      if (sortKey === 'path' && right === '') return -1;
      const cmp = left.localeCompare(right);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  if (rows === null) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <Lock className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">The club roster is officer-only</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Club-wide education progress is visible to the President and VP Education. Your own record
          is below.
        </p>
      </div>
    );
  }

  const onAPath = rows.filter((row) => row.pathCode !== null).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by keyword"
            aria-label="Search members by name or path"
            className="h-9 pl-8"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} member{rows.length === 1 ? '' : 's'} · {onAPath} on a path
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? 'No active members in this club yet.' : `No match for “${query}”.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              {/* Backgrounds on the pinned column must be fully opaque — a
                  translucent tint would let the scrolled level columns show
                  through it. */}
              <tr className="bg-muted">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[9.5rem] border-r border-b border-border bg-muted px-3 py-2.5 text-left text-xs font-medium text-muted-foreground sm:min-w-[13rem] sm:px-4"
                >
                  <SortButton
                    label="Name"
                    active={sortKey === 'name'}
                    dir={sortDir}
                    onClick={() => toggleSort('name')}
                  />
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  <SortButton
                    label="Path"
                    active={sortKey === 'path'}
                    dir={sortDir}
                    onClick={() => toggleSort('path')}
                  />
                </th>
                {LEVELS.map((level) => (
                  <th
                    key={level}
                    scope="col"
                    className="border-b border-border px-3 py-2.5 text-center text-xs font-medium whitespace-nowrap text-muted-foreground"
                  >
                    Level {level}
                  </th>
                ))}
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-center text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  Path Completion
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={`${row.personId}:${row.recordId ?? 'none'}`} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-b border-border bg-background px-3 py-3 text-left font-medium group-last:border-b-0 group-hover:bg-muted sm:px-4"
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      title={`Open ${row.fullName}'s Pathways progress`}
                      className="block max-w-32 truncate text-left text-[var(--brand)] underline-offset-2 hover:underline sm:max-w-none"
                    >
                      {row.fullName}
                    </button>
                  </th>
                  <td className="border-b border-border px-3 py-3 group-last:border-b-0 group-hover:bg-muted">
                    {row.pathName ? (
                      <span className="whitespace-nowrap">{row.pathName}</span>
                    ) : (
                      <span className="whitespace-nowrap text-muted-foreground/70">
                        Not started
                      </span>
                    )}
                  </td>
                  {LEVELS.map((level) => {
                    const entry = row.levels.find((l) => l.level === level);
                    return (
                      <td
                        key={level}
                        className="border-b border-border px-3 py-3 text-center group-last:border-b-0 group-hover:bg-muted"
                      >
                        {entry ? <LevelCell level={entry} /> : null}
                      </td>
                    );
                  })}
                  <td className="border-b border-border px-3 py-3 text-center group-last:border-b-0 group-hover:bg-muted">
                    {row.completedAt ? (
                      <span
                        className="inline-flex size-6 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                        title={row.credential ?? 'Path complete'}
                      >
                        <Check className="size-3.5" aria-hidden />
                        <span className="sr-only">Path complete</span>
                      </span>
                    ) : (
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {row.pathCode ? '0 of 1' : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground sm:hidden">Swipe the table to see all levels.</p>

      <MemberPathwayPanel row={selected} pathways={pathways} onClose={() => setSelected(null)} />
    </div>
  );
}
