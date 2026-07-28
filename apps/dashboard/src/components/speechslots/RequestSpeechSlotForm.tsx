'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RequestSpeechSlotForm({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [pathCode, setPathCode] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [minutes, setMinutes] = useState('7');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/speech-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          pathCode,
          projectCode,
          plannedDurationSeconds: Math.max(1, Number(minutes)) * 60,
        }),
      });
      if (!res.ok) {
        setError('Could not request that slot — check the path/project codes.');
        return;
      }
      setTitle('');
      setPathCode('');
      setProjectCode('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="slot-title">Speech title</Label>
        <Input id="slot-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="slot-path">Path code</Label>
        <Input
          id="slot-path"
          value={pathCode}
          onChange={(e) => setPathCode(e.target.value)}
          placeholder="presentation-mastery"
          className="w-48"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="slot-project">Project code</Label>
        <Input
          id="slot-project"
          value={projectCode}
          onChange={(e) => setProjectCode(e.target.value)}
          placeholder="ice-breaker"
          className="w-48"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="slot-minutes">Minutes</Label>
        <Input
          id="slot-minutes"
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-20"
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Requesting…' : 'Request slot'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
