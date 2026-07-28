'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AddAgendaItemForm({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('5');
  const [roleKey, setRoleKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/agenda-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          plannedDurationSeconds: Math.max(1, Number(minutes)) * 60,
          ...(roleKey ? { roleKey } : {}),
        }),
      });
      if (!res.ok) {
        setError('Could not add that item.');
        return;
      }
      setTitle('');
      setRoleKey('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="agenda-title">Title</Label>
        <Input
          id="agenda-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Table Topics"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agenda-minutes">Minutes</Label>
        <Input
          id="agenda-minutes"
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-20"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="agenda-role">Role (optional)</Label>
        <Input
          id="agenda-role"
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
          placeholder="Toastmaster"
          className="w-40"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add item'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
