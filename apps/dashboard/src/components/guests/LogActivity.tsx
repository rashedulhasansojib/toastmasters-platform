'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquarePlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
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

/**
 * Contact notes only. Visits are not hand-entered any more — a visit is
 * recorded when the guest is marked present on a meeting's Guest List, so the
 * attendance roster and the visit history are the same fact rather than two
 * that can disagree.
 */
export function LogActivity({ clubUnitId, guestId }: { clubUnitId: string; guestId: string }) {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 flex-1 lg:h-9 lg:flex-none"
        onClick={() => setContactOpen(true)}
      >
        <MessageSquarePlusIcon />
        Log contact
      </Button>

      <Dialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        title="Log contact"
        description="Dated note of a follow-up. Entries can't be edited afterwards."
      >
        {contactOpen && (
          <LogContactForm
            clubUnitId={clubUnitId}
            guestId={guestId}
            onDone={() => setContactOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
}

function LogContactForm({
  clubUnitId,
  guestId,
  onDone,
}: {
  clubUnitId: string;
  guestId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<string>('call');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/guests/${guestId}/communications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, note: note.trim() }),
          }),
        {
          loading: 'Logging contact…',
          success: 'Contact logged',
          error: 'Could not log that contact.',
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
        <Select value={channel} onValueChange={(v) => setChannel(v as string)}>
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
        <Label htmlFor="contact-note">Note</Label>
        <Textarea
          id="contact-note"
          rows={3}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was said, and what happens next?"
        />
      </div>

      <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
        {submitting ? 'Saving…' : 'Log contact'}
      </Button>
    </form>
  );
}
