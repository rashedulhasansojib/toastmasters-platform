'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Guest, GuestPipelineStatus } from '@toastmasters/contracts';
import { LockIcon, UserRoundCheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MOVABLE_STATUSES,
  PIPELINE_STATUSES,
  STATUS_ACCENT,
  STATUS_LABEL,
  isRedacted,
} from './pipeline';

/**
 * The phone/tablet-facing kanban. Same column model as the desktop board, but
 * columns snap-scroll horizontally one at a time (85vw, peek of the next) so a
 * VPE can thumb through New → Joined without pinching. Cards carry a Select
 * instead of a drag handle — dragging on a touch screen fights the scroll
 * gesture — and `joined` still routes through the convert-confirm dialog
 * because it creates a Person on the API side, not just a status flip.
 */
export function GuestPipelineBoardMobile({
  clubUnitId,
  guests,
  onMove,
  pendingId,
}: {
  clubUnitId: string;
  guests: Guest[];
  onMove: (guestId: string, target: GuestPipelineStatus) => Promise<boolean>;
  pendingId: string | null;
}) {
  const [convertTarget, setConvertTarget] = useState<Guest | null>(null);

  function handleChange(guest: Guest, target: GuestPipelineStatus) {
    if (target === guest.pipelineStatus) return;
    if (target === 'joined') {
      setConvertTarget(guest);
      return;
    }
    void onMove(guest.id, target);
  }

  return (
    <>
      {/* Negative margin extends the snap track to the screen edge so the peek
          of the next column doesn't sit inside the page gutter. */}
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:px-6"
        role="list"
        aria-label="Guest pipeline columns"
      >
        {PIPELINE_STATUSES.map((status) => {
          const column = guests.filter((p) => p.pipelineStatus === status);
          return (
            <section
              key={status}
              role="listitem"
              aria-label={`${STATUS_LABEL[status]} column, ${column.length} ${column.length === 1 ? 'guest' : 'guests'}`}
              className="flex w-[85vw] max-w-sm shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-muted/20 shadow-sm"
            >
              <header className="flex items-center gap-2 border-b bg-background/70 px-3.5 py-3 backdrop-blur">
                <span className={cn('size-2.5 rounded-full', STATUS_ACCENT[status])} />
                <h3 className="flex-1 text-sm font-semibold">{STATUS_LABEL[status]}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {column.length}
                </span>
              </header>

              <div className="flex min-h-40 flex-1 flex-col gap-2.5 p-2.5">
                {column.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                    {status === 'new' ? 'New guests land here' : 'Nothing here'}
                  </p>
                ) : (
                  column.map((guest) => (
                    <MobileKanbanCard
                      key={guest.id}
                      clubUnitId={clubUnitId}
                      guest={guest}
                      onChange={(target) => handleChange(guest, target)}
                      pending={pendingId === guest.id}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-1 text-center text-xs text-muted-foreground">
        Swipe columns · tap a card’s stage to move it
      </p>

      <Dialog
        open={convertTarget !== null}
        onOpenChange={(open) => !open && setConvertTarget(null)}
        title="Convert to member?"
        description={
          convertTarget
            ? `This creates a member record for ${convertTarget.fullName} and adds them to the club. It can’t be undone from here.`
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

/**
 * A phone-first kanban card. The whole identity block links through; the
 * status Select underneath is a discrete tap target, so a swipe through the
 * column doesn't accidentally arm a move. Redacted rows (post-180-day PII
 * scrub) and `joined` (terminal) rows show a static badge instead of a Select.
 */
function MobileKanbanCard({
  clubUnitId,
  guest,
  onChange,
  pending,
}: {
  clubUnitId: string;
  guest: Guest;
  onChange: (target: GuestPipelineStatus) => void;
  pending: boolean;
}) {
  const redacted = isRedacted(guest);
  const terminal = guest.pipelineStatus === 'joined';

  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border bg-background p-3 shadow-xs transition-opacity',
        pending && 'opacity-60',
      )}
    >
      <Link
        href={`/clubs/${clubUnitId}/guests/${guest.id}`}
        className="flex min-w-0 items-center gap-2.5"
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
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {guest.phone ?? guest.email}
            </p>
          )}
        </div>
        {redacted && (
          <LockIcon
            className="size-3.5 shrink-0 text-muted-foreground/50"
            aria-label="PII expired"
          />
        )}
      </Link>

      {!redacted && !terminal ? (
        <Select
          value={guest.pipelineStatus}
          onValueChange={(v) => onChange(v as GuestPipelineStatus)}
          disabled={pending}
        >
          <SelectTrigger
            aria-label={`Move ${guest.fullName} to a different stage`}
            className="h-9 w-full justify-between rounded-lg border-input bg-background text-xs font-medium"
          >
            <SelectValue>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', STATUS_ACCENT[guest.pipelineStatus])} />
                {STATUS_LABEL[guest.pipelineStatus]}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MOVABLE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                <span className="inline-flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', STATUS_ACCENT[status])} />
                  {STATUS_LABEL[status]}
                </span>
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value="joined">
              <span className="inline-flex items-center gap-2">
                <UserRoundCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Convert to member
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div
          className={cn(
            'inline-flex items-center gap-1.5 self-start rounded-full border px-2 py-0.5 text-xs font-medium',
            terminal
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300',
          )}
        >
          <span className={cn('size-1.5 rounded-full', STATUS_ACCENT[guest.pipelineStatus])} />
          {STATUS_LABEL[guest.pipelineStatus]}
        </div>
      )}
    </article>
  );
}
