'use client';

import { useState } from 'react';
import type { Prospect } from '@toastmasters/contracts';
import { PencilIcon, ShuffleIcon, UserRoundCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MoveProspectSheet } from './MoveProspectSheet';
import { ProspectFormDialog } from './ProspectFormDialog';
import { useProspectActions } from './useProspectActions';
import { isRedacted } from './pipeline';

/**
 * The write surface of the detail page. Shares `useProspectActions` with the
 * pipeline screen so "move" means the same thing — and costs the same request
 * — wherever it's triggered from.
 */
export function ProspectDetailActions({
  clubUnitId,
  prospect,
}: {
  clubUnitId: string;
  prospect: Prospect;
}) {
  const { moveTo, pendingId, error, clearError } = useProspectActions(clubUnitId);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const redacted = isRedacted(prospect);
  const joined = prospect.pipelineStatus === 'joined';
  const pending = pendingId !== null;

  if (redacted) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        This prospect&apos;s details were removed by the 180-day retention job. The record is kept
        for its visit history, but it can no longer be edited or converted.
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
            className="h-11 flex-1 sm:h-9 sm:flex-none"
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
          className="h-11 flex-1 sm:h-9 sm:flex-none"
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
          className="h-11 sm:h-9"
          onClick={() => setConvertOpen(true)}
          disabled={pending}
        >
          <UserRoundCheckIcon />
          Convert to member
        </Button>
      )}

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

      <MoveProspectSheet
        prospect={moveOpen ? prospect : null}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onMove={moveTo}
        pending={pending}
        error={error}
      />

      <ProspectFormDialog
        clubUnitId={clubUnitId}
        prospect={prospect}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Convert to member?"
        description={`This creates a member record for ${prospect.fullName} and adds them to the club. It can't be undone from here.`}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 sm:h-9"
            onClick={() => setConvertOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-11 sm:h-9"
            disabled={pending}
            onClick={() => {
              setConvertOpen(false);
              void moveTo(prospect.id, 'joined');
            }}
          >
            {pending ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
