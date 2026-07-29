'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Prospect, ProspectPipelineStatus } from '@toastmasters/contracts';
import { GripVerticalIcon, LockIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PIPELINE_STATUSES, STATUS_ACCENT, STATUS_LABEL, isRedacted } from './pipeline';

/**
 * The wide-screen view. Drag-and-drop is an enhancement, never the only route
 * — every card keeps the same tap-to-move affordance the phone layout uses, so
 * the board stays usable by keyboard and by anyone who can't drag.
 *
 * Two columns refuse a plain drop, because the API refuses the write:
 * `New` is unreachable once a prospect exists, and `Joined` is conversion —
 * a Person plus a ClubMembership — so it asks first.
 */
export function ProspectPipelineBoard({
  clubUnitId,
  prospects,
  onMove,
  onRequestMove,
  pendingId,
}: {
  clubUnitId: string;
  prospects: Prospect[];
  onMove: (prospectId: string, target: ProspectPipelineStatus) => Promise<boolean>;
  onRequestMove: (prospect: Prospect) => void;
  pendingId: string | null;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ProspectPipelineStatus | null>(null);
  const [convertTarget, setConvertTarget] = useState<Prospect | null>(null);

  function canDrop(status: ProspectPipelineStatus): boolean {
    if (status === 'new') return false;
    const dragged = prospects.find((p) => p.id === dragId);
    if (!dragged) return false;
    return dragged.pipelineStatus !== status;
  }

  function handleDrop(status: ProspectPipelineStatus) {
    const dragged = prospects.find((p) => p.id === dragId);
    setOverColumn(null);
    setDragId(null);
    if (!dragged || !canDrop(status)) return;

    if (status === 'joined') {
      setConvertTarget(dragged);
      return;
    }
    void onMove(dragged.id, status);
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {PIPELINE_STATUSES.map((status) => {
          const column = prospects.filter((p) => p.pipelineStatus === status);
          const receptive = dragId !== null && canDrop(status);

          return (
            <section
              key={status}
              onDragOver={(event) => {
                if (!receptive) return;
                event.preventDefault();
                setOverColumn(status);
              }}
              onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
              onDrop={() => handleDrop(status)}
              className={cn(
                'flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20 transition-colors',
                overColumn === status && 'bg-muted/60 ring-2 ring-primary/40',
                dragId !== null && !receptive && 'opacity-50',
              )}
            >
              <header className="flex items-center gap-2 rounded-t-xl border-b bg-background/60 px-3 py-2.5">
                <span className={cn('size-2 rounded-full', STATUS_ACCENT[status])} />
                <h3 className="flex-1 text-sm font-semibold">{STATUS_LABEL[status]}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {column.length}
                </span>
              </header>

              <div className="flex min-h-32 flex-1 flex-col gap-2 p-2">
                {column.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {status === 'new' ? 'New prospects land here' : 'Nothing here'}
                  </p>
                ) : (
                  column.map((prospect) => {
                    const redacted = isRedacted(prospect);
                    const draggable = prospect.pipelineStatus !== 'joined' && !redacted;

                    return (
                      <div
                        key={prospect.id}
                        draggable={draggable}
                        onDragStart={() => setDragId(prospect.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverColumn(null);
                        }}
                        className={cn(
                          'group rounded-lg border bg-background p-2.5 shadow-sm transition-opacity',
                          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                          dragId === prospect.id && 'opacity-40',
                          pendingId === prospect.id && 'opacity-60',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/clubs/${clubUnitId}/prospects/${prospect.id}`}
                            className="flex min-w-0 flex-1 items-center gap-2"
                          >
                            <Avatar
                              name={prospect.fullName}
                              photoUrl={prospect.photoUrl}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'truncate text-sm font-medium',
                                  redacted && 'text-muted-foreground italic',
                                )}
                              >
                                {redacted ? 'Details removed' : prospect.fullName}
                              </p>
                              {!redacted && (prospect.phone || prospect.email) && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {prospect.phone ?? prospect.email}
                                </p>
                              )}
                            </div>
                          </Link>

                          {redacted ? (
                            <LockIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                          ) : draggable ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onRequestMove(prospect)}
                                aria-label={`Move ${prospect.fullName} to a different stage`}
                                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100"
                              >
                                <GripVerticalIcon className="size-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog
        open={convertTarget !== null}
        onOpenChange={(open) => !open && setConvertTarget(null)}
        title="Convert to member?"
        description={
          convertTarget
            ? `This creates a member record for ${convertTarget.fullName} and adds them to the club. It can't be undone from here.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConvertTarget(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pendingId !== null}
            onClick={() => {
              const target = convertTarget;
              if (!target) return;
              setConvertTarget(null);
              void onMove(target.id, 'joined');
            }}
          >
            Convert
          </Button>
        </div>
      </Dialog>
    </>
  );
}
