'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function AddMeetingForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState('');
  const [date, setDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${date}T18:00:00.000Z`).toISOString();
      const result = await submitAction(
        () =>
          fetch('/api/sandbox/meetings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme, scheduledAt }),
          }),
        {
          loading: 'Creating meeting…',
          success: 'Meeting created',
          error: 'Could not create meeting',
        },
      );
      if (!result) return;
      setTheme('');
      setDate('');
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Create meeting
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="meeting-theme">Theme</Label>
        <Input
          id="meeting-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          required
          className="w-64"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="meeting-date">Date</Label>
        <Input
          id="meeting-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-44"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
