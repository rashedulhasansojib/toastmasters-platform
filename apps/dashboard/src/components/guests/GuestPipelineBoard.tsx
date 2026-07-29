'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Guest, GuestPipelineStatus } from '@toastmasters/contracts';
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
 * `New` is unreachable once a guest exists, and `Joined` is conversion —
 * a Person plus a ClubMembership — so it asks first.
 */
export function GuestPipelineBoard({
  clubUnitId,
  guests,
  onMove,
  onRequestMove,
  pendingId,
}: {
  clubUnitId: string;
  guests: Guest[];
  onMove: (guestId: string, target: GuestPipelineStatus) => Promise<boolean>;
  onRequestMove: (guest: Guest) => void;
  pendingId: string | null;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<GuestPipelineStatus | null>(null);
  const [convertTarget, setConvertTarget] = useState<Guest | null>(null);

  function canDrop(status: GuestPipelineStatus): boolean {
    if (status === 'new') return false;
    const dragged = guests.find((p) => p.id === dragId);
    if (!dragged) return false;
    return dragged.pipelineStatus !== status;
  }

  function handleDrop(status: GuestPipelineStatus) {
    const dragged = guests.find((p) => p.id === dragId);
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
          const column = guests.filter((p) => p.pipelineStatus === status);
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
                    {status === 'new' ? 'New guests land here' : 'Nothing here'}
                  </p>
                ) : (
                  column.map((guest) => {
                    const redacted = isRedacted(guest);
                    const draggable = guest.pipelineStatus !== 'joined' && !redacted;

                    return (
                      <div
                        key={guest.id}
                        draggable={draggable}
                        onDragStart={() => setDragId(guest.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverColumn(null);
                        }}
                        className={cn(
                          'group rounded-lg border bg-background p-2.5 shadow-sm transition-opacity',
                          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                          dragId === guest.id && 'opacity-40',
                          pendingId === guest.id && 'opacity-60',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/clubs/${clubUnitId}/guests/${guest.id}`}
                            className="flex min-w-0 flex-1 items-center gap-2"
                          >
                            <Avatar name={guest.fullName} photoUrl={guest.photoUrl} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'truncate text-sm font-medium',
                                  redacted && 'text-muted-foreground italic',
                                )}
                              >
                                {redacted ? 'Details removed' : guest.fullName}
                              </p>
                              {!redacted && (guest.phone || guest.email) && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {guest.phone ?? guest.email}
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
                                onClick={() => onRequestMove(guest)}
                                aria-label={`Move ${guest.fullName} to a different stage`}
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
