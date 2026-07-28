'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LogVisitForm({
  clubUnitId,
  prospectId,
}: {
  clubUnitId: string;
  prospectId: string;
}) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState('');
  const [attendedAt, setAttendedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/prospects/${prospectId}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, attendedAt: new Date(attendedAt).toISOString() }),
      });
      if (!res.ok) {
        setError('Could not log that visit — check the meeting ID.');
        return;
      }
      setMeetingId('');
      setAttendedAt('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="visit-meeting-id">Meeting ID</Label>
        <Input
          id="visit-meeting-id"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="visit-attended-at">Attended</Label>
        <Input
          id="visit-attended-at"
          type="datetime-local"
          value={attendedAt}
          onChange={(e) => setAttendedAt(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Logging…' : 'Log visit'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
