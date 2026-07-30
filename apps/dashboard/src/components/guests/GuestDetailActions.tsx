'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Guest } from '@toastmasters/contracts';
import { PencilIcon, ShuffleIcon, Trash2Icon, UserRoundCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MoveGuestDialog } from './MoveGuestDialog';
import { GuestFormDialog } from './GuestFormDialog';
import { useGuestActions } from './useGuestActions';
import { isRedacted } from './pipeline';

/**
 * The write surface of the detail page. Shares `useGuestActions` with the
 * pipeline screen so "move" means the same thing — and costs the same request
 * — wherever it's triggered from.
 */
export function GuestDetailActions({ clubUnitId, guest }: { clubUnitId: string; guest: Guest }) {
  const router = useRouter();
  const { moveTo, remove, pendingId } = useGuestActions(clubUnitId);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const redacted = isRedacted(guest);
  const joined = guest.pipelineStatus === 'joined';
  const pending = pendingId !== null;

  if (redacted) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        This guest&apos;s details were removed by the 180-day retention job. The record is kept for
        its visit history, but it can no longer be edited or converted.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {!joined && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 flex-1 lg:h-9 lg:flex-none"
            onClick={() => setMoveOpen(true)}
            disabled={pending}
          >
            <ShuffleIcon />
            Move stage
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 flex-1 lg:h-9 lg:flex-none"
          onClick={() => setEditOpen(true)}
        >
          <PencilIcon />
          Edit
        </Button>
      </div>

      {!joined && (
        <Button
          type="button"
          size="lg"
          className="h-11 lg:h-9"
          onClick={() => setConvertOpen(true)}
          disabled={pending}
        >
          <UserRoundCheckIcon />
          Convert to member
        </Button>
      )}

      {!joined && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive lg:h-9"
          onClick={() => setDeleteOpen(true)}
          disabled={pending}
        >
          <Trash2Icon />
          Delete guest
        </Button>
      )}

      <MoveGuestDialog
        guest={moveOpen ? guest : null}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onMove={moveTo}
        pending={pending}
      />

      <GuestFormDialog
        clubUnitId={clubUnitId}
        guest={guest}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to member?"
        description={`This creates a member record for ${guest.fullName} and adds them to the club. It can't be undone from here.`}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 lg:h-9"
            onClick={() => setConvertOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-11 lg:h-9"
            disabled={pending}
            onClick={() => {
              setConvertOpen(false);
              void moveTo(guest.id, 'joined');
            }}
          >
            {pending ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this guest?"
        description={`This removes ${guest.fullName} and their visit and communication history from this club. It can't be undone.`}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 lg:h-9"
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90 lg:h-9"
            disabled={pending}
            onClick={() => {
              setDeleteOpen(false);
              void remove(guest.id).then((ok) => {
                if (ok) router.push(`/clubs/${clubUnitId}/guests`);
              });
            }}
          >
            {pending ? 'Deleting…' : 'Delete guest'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
