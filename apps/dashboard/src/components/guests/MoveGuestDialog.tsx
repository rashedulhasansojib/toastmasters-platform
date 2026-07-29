'use client';

import type { Guest, GuestPipelineStatus } from '@toastmasters/contracts';
import { CheckIcon, UserRoundCheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { MOVABLE_STATUSES, STATUS_ACCENT, STATUS_LABEL } from './pipeline';

/**
 * The phone's answer to dragging a card between columns: tap the status, pick
 * the next one. Same three destinations the board's drop targets allow, plus
 * conversion, which is a different endpoint entirely.
 *
 * Uses the responsive dialog, so it reads as a bottom sheet under the thumb on
 * a phone and a centred dialog on a laptop — rather than a drawer sliding up
 * from the bottom of a 27" monitor.
 */
export function MoveGuestDialog({
  guest,
  open,
  onOpenChange,
  onMove,
  pending,
  error,
}: {
  guest: Guest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (guestId: string, target: GuestPipelineStatus) => Promise<boolean>;
  pending: boolean;
  error: string | null;
}) {
  if (!guest) return null;

  async function select(target: GuestPipelineStatus) {
    if (!guest) return;
    const ok = await onMove(guest.id, target);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={guest.fullName}
      description="Move to a different stage"
    >
      <div className="flex flex-col gap-1">
        {MOVABLE_STATUSES.map((status) => {
          const current = guest.pipelineStatus === status;
          return (
            <button
              key={status}
              type="button"
              disabled={pending || current}
              onClick={() => void select(status)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm sm:min-h-10',
                'active:bg-accent disabled:opacity-60 sm:hover:bg-accent',
                current && 'bg-accent/60',
              )}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', STATUS_ACCENT[status])} />
              <span className="flex-1 font-medium">{STATUS_LABEL[status]}</span>
              {current && <CheckIcon className="size-4 shrink-0 text-muted-foreground" />}
            </button>
          );
        })}

        <div className="my-1 h-px bg-border" />

        <button
          type="button"
          disabled={pending}
          onClick={() => void select('joined')}
          className={cn(
            'flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm sm:min-h-10',
            'active:bg-accent disabled:opacity-60 sm:hover:bg-accent',
          )}
        >
          <UserRoundCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="flex-1">
            <span className="block font-medium">Convert to member</span>
            <span className="block text-xs text-muted-foreground">
              Creates their member record — needs an email on file
            </span>
          </span>
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Dialog>
  );
}
