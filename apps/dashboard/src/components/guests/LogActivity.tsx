'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting } from '@toastmasters/contracts';
import { CalendarPlusIcon, MessageSquarePlusIcon } from 'lucide-react';

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
import { CHANNELS, CHANNEL_LABEL, formatDate } from './pipeline';

/** `Meeting.title` is nullable, so fall back to its number, then its date. */
function meetingLabel(meeting: Meeting): string {
  const when = formatDate(meeting.scheduledAt);
  if (meeting.title) return `${meeting.title} · ${when}`;
  if (meeting.meetingNumber !== null) return `Meeting #${meeting.meetingNumber} · ${when}`;
  return when;
}

/**
 * Both append-only logs behind two thumb-sized buttons. A visit must reference
 * a real meeting — the API takes a `meetingId`, not a free date — so this
 * picks from the club's meetings rather than asking anyone to paste a UUID.
 */
export function LogActivity({
  clubUnitId,
  guestId,
  meetings,
}: {
  clubUnitId: string;
  guestId: string;
  meetings: Meeting[];
}) {
  const [contactOpen, setContactOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

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
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 flex-1 lg:h-9 lg:flex-none"
        onClick={() => setVisitOpen(true)}
        disabled={meetings.length === 0}
      >
        <CalendarPlusIcon />
        Log visit
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

      <Dialog
        open={visitOpen}
        onOpenChange={setVisitOpen}
        title="Log visit"
        description="Record that they attended one of the club's meetings."
      >
        {visitOpen && (
          <LogVisitForm
            clubUnitId={clubUnitId}
            guestId={guestId}
            meetings={meetings}
            onDone={() => setVisitOpen(false)}
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/clubs/${clubUnitId}/guests/${guestId}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, note: note.trim() }),
      });
      if (!response.ok) {
        setError('Could not log that contact.');
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError('Network error — nothing was logged.');
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
        {submitting ? 'Saving…' : 'Log contact'}
      </Button>
    </form>
  );
}

function LogVisitForm({
  clubUnitId,
  guestId,
  meetings,
  onDone,
}: {
  clubUnitId: string;
  guestId: string;
  meetings: Meeting[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState<string>(meetings[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const meeting = meetings.find((m) => m.id === meetingId);
    if (!meeting) {
      setError('Pick a meeting first.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/clubs/${clubUnitId}/guests/${guestId}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The visit is the meeting's own instant — no separate date to key wrong.
        body: JSON.stringify({ meetingId: meeting.id, attendedAt: meeting.scheduledAt }),
      });
      if (!response.ok) {
        setError('Could not log that visit — it may already be recorded.');
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError('Network error — nothing was logged.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Which meeting?</Label>
        <Select value={meetingId} onValueChange={(v) => setMeetingId(v as string)}>
          <SelectTrigger className="h-11 lg:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meetings.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {meetingLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
        {submitting ? 'Saving…' : 'Log visit'}
      </Button>
    </form>
  );
}
