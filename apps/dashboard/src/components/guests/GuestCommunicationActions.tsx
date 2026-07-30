'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontalIcon } from 'lucide-react';
import type { GuestCommunication, GuestCommunicationChannel } from '@toastmasters/contracts';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitAction } from '@/lib/toast';
import { CHANNELS, CHANNEL_LABEL } from './pipeline';

export function GuestCommunicationActions({
  clubUnitId,
  communication,
}: {
  clubUnitId: string;
  communication: GuestCommunication;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Entry options"
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
            'hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit contact"
        description="Only you can edit an entry you logged."
      >
        {editOpen && (
          <EditForm
            clubUnitId={clubUnitId}
            communication={communication}
            onDone={() => setEditOpen(false)}
          />
        )}
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete contact"
        description="This removes the entry. It won't appear in the activity log any more."
      >
        {deleteOpen && (
          <DeleteConfirm
            clubUnitId={clubUnitId}
            communication={communication}
            onDone={() => setDeleteOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

function EditForm({
  clubUnitId,
  communication,
  onDone,
}: {
  clubUnitId: string;
  communication: GuestCommunication;
  onDone: () => void;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<GuestCommunicationChannel>(communication.channel);
  const [note, setNote] = useState(communication.note);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(
            `/api/clubs/${clubUnitId}/guests/${communication.guestId}/communications/${communication.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channel, note: note.trim() }),
            },
          ),
        {
          loading: 'Saving…',
          success: 'Contact updated',
          error: 'Could not save that change.',
        },
      );
      if (!result) return;
      onDone();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>How did you reach them?</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v as GuestCommunicationChannel)}>
          <SelectTrigger className="h-11 lg:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-note-${communication.id}`}>Note</Label>
        <Textarea
          id={`edit-note-${communication.id}`}
          rows={3}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

function DeleteConfirm({
  clubUnitId,
  communication,
  onDone,
}: {
  clubUnitId: string;
  communication: GuestCommunication;
  onDone: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm() {
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(
            `/api/clubs/${clubUnitId}/guests/${communication.guestId}/communications/${communication.id}`,
            { method: 'DELETE' },
          ),
        {
          loading: 'Deleting…',
          success: 'Contact deleted',
          error: 'Could not delete that entry.',
        },
      );
      if (!result) return;
      onDone();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">This can&apos;t be undone.</p>
      <div className="flex justify-end gap-2">
        <DialogClose
          type="button"
          className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Cancel
        </DialogClose>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          disabled={submitting}
        >
          {submitting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </div>
  );
}
