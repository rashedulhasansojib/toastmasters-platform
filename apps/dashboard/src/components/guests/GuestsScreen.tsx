'use client';

import { useMemo, useState } from 'react';
import type { Guest, GuestPipelineStatus } from '@toastmasters/contracts';
import { KanbanIcon, ListIcon, PlusIcon, SearchIcon, UsersIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GuestCard } from './GuestCard';
import { GuestFormDialog } from './GuestFormDialog';
import { GuestPipelineBoard } from './GuestPipelineBoard';
import { GuestPipelineBoardMobile } from './GuestPipelineBoardMobile';
import { MoveGuestDialog } from './MoveGuestDialog';
import { useGuestActions } from './useGuestActions';
import { PIPELINE_STATUSES, STATUS_ACCENT, STATUS_LABEL } from './pipeline';

type Filter = GuestPipelineStatus | 'all';

/**
 * The board is the primary view and the initial state on every breakpoint. On
 * a laptop it renders as five side-by-side columns with drag-and-drop; on a
 * phone the same columns become a horizontal snap-scroll and each card carries
 * a Select instead of a drag handle — dragging fights a touch scroll. Both
 * views share one dataset and one write path, so they can't drift.
 *
 * The list view stays available as a toggle for filtering-heavy workflows. On
 * a phone it keeps its stage rail of filter chips; from `lg:` up the rail
 * collapses into a dropdown and the grid widens instead of stretching
 * phone-sized cards.
 */
export function GuestsScreen({ clubUnitId, guests }: { clubUnitId: string; guests: Guest[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'board'>('board');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Guest | undefined>();
  const [moveTarget, setMoveTarget] = useState<Guest | null>(null);

  const { moveTo, pendingId } = useGuestActions(clubUnitId);

  const counts = useMemo(() => {
    const base = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as Record<
      GuestPipelineStatus,
      number
    >;
    for (const p of guests) base[p.pipelineStatus] += 1;
    return base;
  }, [guests]);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter((p) =>
      [p.fullName, p.email, p.phone, p.leadSource]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [guests, query]);

  const visible = useMemo(
    () => (filter === 'all' ? searched : searched.filter((p) => p.pipelineStatus === filter)),
    [searched, filter],
  );

  function openCreate() {
    setEditTarget(undefined);
    setFormOpen(true);
  }

  const chips: Array<{ key: Filter; label: string; count: number; accent?: string }> = [
    { key: 'all', label: 'All', count: searched.length },
    ...PIPELINE_STATUSES.map((status) => ({
      key: status as Filter,
      label: STATUS_LABEL[status],
      count: searched.filter((p) => p.pipelineStatus === status).length,
      accent: STATUS_ACCENT[status],
    })),
  ];

  return (
    <div className="flex flex-col gap-4 px-4 pb-24 pt-4 sm:px-6 lg:pb-8">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Guests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {guests.length === 0
              ? 'Nobody in the pipeline yet'
              : `${guests.length} in the pipeline · ${counts.joined} joined`}
          </p>
        </div>
        {/* Wide screens get the header button; phones get the thumb-reachable FAB below. */}
        <Button className="hidden shrink-0 lg:inline-flex" onClick={openCreate}>
          <PlusIcon />
          Add guest
        </Button>
      </header>

      {/* One toolbar row; every control shares a height so the row reads as a
          single band rather than three differently-sized boxes. Hidden on an
          empty pipeline — searching and filtering nothing is just furniture in
          front of the one thing there is to do. */}
      <div className={cn('flex items-center gap-2', guests.length === 0 && 'hidden')}>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search guests…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9 lg:h-9"
            aria-label="Search guests"
          />
        </div>

        {/* Desktop filters with a dropdown; the phone gets the stage rail below.
            A row of pills is a touch pattern — on a laptop it just eats the
            toolbar and reads as a stretched phone screen. */}
        {view === 'list' && (
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            aria-label="Filter by stage"
          >
            <SelectTrigger className="hidden h-9 w-48 shrink-0 lg:flex">
              {/* Without a formatter this renders the raw enum — a trigger
                  reading "all" or "not_interested" rather than a label. */}
              <SelectValue>
                {(value) => {
                  const active = chips.find((c) => c.key === value);
                  return active ? `${active.label} · ${active.count}` : 'All stages';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {chips.map(({ key, label, count }) => (
                <SelectItem key={key} value={key}>
                  {label} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Board is the primary view on every breakpoint; the toggle lets a
            user drop to the searchable list when hunting for a specific guest.

            A segmented control — a recessed track with the selected segment
            raised out of it. The earlier version filled the active segment with
            `primary`, which on this near-black neutral palette read as a solid
            ink blob rather than a selected tab. */}
        <div
          role="group"
          aria-label="View"
          className="flex h-11 shrink-0 items-center gap-1 rounded-lg bg-muted p-1 lg:h-9"
        >
          {(
            [
              { key: 'board', label: 'Board', Icon: KanbanIcon },
              { key: 'list', label: 'List', Icon: ListIcon },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              title={label}
              className={cn(
                'inline-flex h-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all',
                view === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'list' && (
        <div className="flex flex-col gap-4">
          {/* Wraps rather than scrolls: a horizontal rail hid the later stages
              off-screen behind a swipe nobody knew was there. */}
          <div className={cn('flex flex-wrap gap-2 lg:hidden', guests.length === 0 && 'hidden')}>
            {chips.map(({ key, label, count, accent }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  filter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground',
                )}
              >
                {accent && (
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      filter === key ? 'bg-primary-foreground/70' : accent,
                    )}
                  />
                )}
                {label}
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    filter === key ? 'text-primary-foreground/70' : 'text-muted-foreground/70',
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              hasAny={guests.length > 0}
              filtered={query.trim() !== '' || filter !== 'all'}
              onAdd={openCreate}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:gap-2.5 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((guest) => (
                <GuestCard
                  key={guest.id}
                  clubUnitId={clubUnitId}
                  guest={guest}
                  onRequestMove={setMoveTarget}
                  pending={pendingId === guest.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'board' &&
        (searched.length === 0 ? (
          <EmptyState
            hasAny={guests.length > 0}
            filtered={query.trim() !== ''}
            onAdd={openCreate}
          />
        ) : (
          <>
            <div className="lg:hidden">
              <GuestPipelineBoardMobile
                clubUnitId={clubUnitId}
                guests={searched}
                onMove={moveTo}
                pendingId={pendingId}
              />
            </div>
            <div className="hidden lg:block">
              <GuestPipelineBoard
                clubUnitId={clubUnitId}
                guests={searched}
                onMove={moveTo}
                onRequestMove={setMoveTarget}
                pendingId={pendingId}
              />
            </div>
          </>
        ))}

      {/* Thumb-reachable on a phone, where the header button is out of reach.
          Suppressed while the empty state is up — that already puts the same
          call to action in the middle of the screen, and two identical buttons
          is just clutter. */}
      {guests.length > 0 && (
        <Button
          onClick={openCreate}
          aria-label="Add guest"
          className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-40 h-13 gap-2 rounded-full px-5 text-sm shadow-lg ring-1 ring-black/5 lg:hidden"
        >
          <PlusIcon className="size-5" />
          Add guest
        </Button>
      )}

      <GuestFormDialog
        clubUnitId={clubUnitId}
        guest={editTarget}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <MoveGuestDialog
        guest={moveTarget}
        open={moveTarget !== null}
        onOpenChange={(open) => !open && setMoveTarget(null)}
        onMove={moveTo}
        pending={pendingId !== null}
      />
    </div>
  );
}

function EmptyState({
  hasAny,
  filtered,
  onAdd,
}: {
  hasAny: boolean;
  filtered: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <UsersIcon className="size-5 text-muted-foreground" />
      </div>
      {hasAny && filtered ? (
        <p className="text-sm text-muted-foreground">No guests match that search.</p>
      ) : (
        <>
          <p className="font-medium">No guests yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Add the guests who visit, and track them through to joining.
          </p>
          <Button className="mt-5" onClick={onAdd}>
            <PlusIcon />
            Add guest
          </Button>
        </>
      )}
    </div>
  );
}
