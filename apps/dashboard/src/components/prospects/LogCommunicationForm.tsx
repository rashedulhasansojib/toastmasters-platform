'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Channel = 'call' | 'message' | 'email' | 'in_person' | 'other';
const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'call', label: 'Call' },
  { value: 'message', label: 'Message' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
];

export function LogCommunicationForm({
  clubUnitId,
  prospectId,
}: {
  clubUnitId: string;
  prospectId: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>('call');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/prospects/${prospectId}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, note }),
      });
      if (!res.ok) {
        setError('Could not log that communication.');
        return;
      }
      setNote('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label>Channel</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNELS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-64 flex-1 flex-col gap-1">
        <Label htmlFor="comm-note">Note</Label>
        <Textarea id="comm-note" value={note} onChange={(e) => setNote(e.target.value)} required />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Logging…' : 'Log communication'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
