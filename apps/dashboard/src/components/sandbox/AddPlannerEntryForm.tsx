'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function AddPlannerEntryForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState('');
  const [theme, setTheme] = useState('');
  const [toastmaster, setToastmaster] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch('/api/sandbox/planner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingDate,
              theme,
              toastmaster: toastmaster || null,
            }),
          }),
        { loading: 'Adding entry…', success: 'Planner entry added', error: 'Could not add entry' },
      );
      if (!result) return;
      setMeetingDate('');
      setTheme('');
      setToastmaster('');
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add planner entry
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="planner-date">Meeting date</Label>
        <Input
          id="planner-date"
          type="date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          required
          className="w-44"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="planner-theme">Theme</Label>
        <Input
          id="planner-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          required
          className="w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="planner-toastmaster">Toastmaster</Label>
        <Input
          id="planner-toastmaster"
          value={toastmaster}
          onChange={(e) => setToastmaster(e.target.value)}
          placeholder="Unassigned"
          className="w-48"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
