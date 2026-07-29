'use client';

import { useMemo, useState } from 'react';
import type { Prospect, ProspectPipelineStatus } from '@toastmasters/contracts';
import { KanbanIcon, ListIcon, PlusIcon, SearchIcon, UsersIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProspectCard } from './ProspectCard';
import { ProspectFormDialog } from './ProspectFormDialog';
import { ProspectPipelineBoard } from './ProspectPipelineBoard';
import { MoveProspectSheet } from './MoveProspectSheet';
import { useProspectActions } from './useProspectActions';
import { PIPELINE_STATUSES, STATUS_ACCENT, STATUS_LABEL } from './pipeline';

type Filter = ProspectPipelineStatus | 'all';

/**
 * Mobile-first by construction. The board the legacy portal shows on a laptop
 * is five side-by-side columns behind a horizontal scroll — unusable on a
 * phone, and drag-and-drop is the wrong gesture on a touch screen anyway.
 *
 * So the phone gets the same model expressed differently: the stage rail is
 * the set of columns, viewed one at a time, and moving a prospect is a tap on
 * its status chip rather than a drag. The board is a wide-screen enhancement,
 * rendered only from `lg:` up; both views share one dataset and one write
 * path, so they can't drift.
 */
export function ProspectsScreen({
  clubUnitId,
  prospects,
}: {
  clubUnitId: string;
  prospects: Prospect[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Prospect | undefined>();
  const [moveTarget, setMoveTarget] = useState<Prospect | null>(null);

  const { moveTo, pendingId, error, clearError } = useProspectActions(clubUnitId);

  const counts = useMemo(() => {
    const base = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as Record<
      ProspectPipelineStatus,
      number
    >;
    for (const p of prospects) base[p.pipelineStatus] += 1;
    return base;
  }, [prospects]);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return prospects;
    return prospects.filter((p) =>
      [p.fullName, p.email, p.phone, p.leadSource]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [prospects, query]);

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
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Prospects</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {prospects.length === 0
              ? 'Nobody in the pipeline yet'
              : `${prospects.length} in the pipeline · ${counts.joined} joined`}
          </p>
        </div>
        {/* Wide screens get the header button; phones get the thumb-reachable FAB below. */}
        <Button size="lg" className="hidden lg:inline-flex" onClick={openCreate}>
          <PlusIcon />
          Add prospect
        </Button>
      </header>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, phone, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 pl-9 sm:h-9"
            aria-label="Search prospects"
          />
        </div>

        {/* The board is a laptop affordance — no toggle on a phone at all. */}
        <div className="hidden shrink-0 items-center gap-0.5 rounded-lg border p-0.5 lg:flex">
          {(
            [
              { key: 'list', label: 'List', Icon: ListIcon },
              { key: 'board', label: 'Board', Icon: KanbanIcon },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span>{error}</span>
          <button type="button" onClick={clearError} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Stage rail + cards: the phone's whole pipeline, and the desktop list view. */}
      <div className={cn('flex flex-col gap-4', view === 'board' && 'lg:hidden')}>
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <div className="flex w-max gap-2">
            {chips.map(({ key, label, count, accent }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors',
                  filter === key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground active:bg-accent sm:hover:bg-accent',
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
                <span className={cn('text-xs', filter !== key && 'text-muted-foreground/70')}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            hasAny={prospects.length > 0}
            filtered={query.trim() !== '' || filter !== 'all'}
            onAdd={openCreate}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((prospect) => (
              <ProspectCard
                key={prospect.id}
                clubUnitId={clubUnitId}
                prospect={prospect}
                onRequestMove={setMoveTarget}
                pending={pendingId === prospect.id}
              />
            ))}
          </div>
        )}
      </div>

      {view === 'board' && (
        <div className="hidden lg:block">
          {searched.length === 0 ? (
            <EmptyState
              hasAny={prospects.length > 0}
              filtered={query.trim() !== ''}
              onAdd={openCreate}
            />
          ) : (
            <ProspectPipelineBoard
              clubUnitId={clubUnitId}
              prospects={searched}
              onMove={moveTo}
              onRequestMove={setMoveTarget}
              pendingId={pendingId}
            />
          )}
        </div>
      )}

      {/* Thumb-reachable on a phone, where the header button is out of reach. */}
      <Button
        size="lg"
        onClick={openCreate}
        aria-label="Add prospect"
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 h-14 rounded-full px-5 shadow-lg lg:hidden"
      >
        <PlusIcon />
        Add
      </Button>

      <ProspectFormDialog
        clubUnitId={clubUnitId}
        prospect={editTarget}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <MoveProspectSheet
        prospect={moveTarget}
        open={moveTarget !== null}
        onOpenChange={(open) => !open && setMoveTarget(null)}
        onMove={moveTo}
        pending={pendingId !== null}
        error={error}
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <UsersIcon className="mb-3 size-10 text-muted-foreground/30" />
      {hasAny && filtered ? (
        <p className="text-sm text-muted-foreground">No prospects match that.</p>
      ) : (
        <>
          <p className="font-medium">No prospects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the guests who visit, and track them through to joining.
          </p>
          <Button size="lg" className="mt-4" onClick={onAdd}>
            <PlusIcon />
            Add prospect
          </Button>
        </>
      )}
    </div>
  );
}
