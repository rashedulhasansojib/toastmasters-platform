'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ExComMeeting } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CreateMeetingForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [heldAt, setHeldAt] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programYearId) {
      setError('No active program year.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/excom-meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programYearId,
          heldAt: new Date(heldAt).toISOString(),
          location,
          quorumRule: 'majority of serving officers',
        }),
      });
      if (!res.ok) {
        setError('Could not schedule that meeting.');
        return;
      }
      setHeldAt('');
      setLocation('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="excom-held-at">Held at</Label>
        <Input
          id="excom-held-at"
          type="datetime-local"
          value={heldAt}
          onChange={(e) => setHeldAt(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="excom-location">Location</Label>
        <Input
          id="excom-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Scheduling…' : 'Schedule ExCom meeting'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

function MoveMotionAction({
  clubUnitId,
  meeting,
  programYearId,
}: {
  clubUnitId: string;
  meeting: ExComMeeting;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function moveMotion() {
    const text = window.prompt('Motion text?');
    if (!text) return;
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/excom-meetings/${meeting.id}/motions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, movedByPersonId: meeting.calledBy }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function draftMinutes() {
    if (!programYearId) {
      window.alert('No active program year.');
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/excom-meetings/${meeting.id}/minutes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programYearId, visibility: 'officers' }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={moveMotion} disabled={busy}>
        Move a motion
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={draftMinutes} disabled={busy}>
        Draft minutes
      </Button>
    </div>
  );
}

export function ExComPanel({
  clubUnitId,
  programYearId,
  meetings,
}: {
  clubUnitId: string;
  programYearId: string | null;
  meetings: ExComMeeting[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <CreateMeetingForm clubUnitId={clubUnitId} programYearId={programYearId} />
      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ExCom meetings yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {meetings.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {m.location} — {new Date(m.heldAt).toLocaleString()} ({m.status})
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Quorum ({m.quorumRule}): {m.quorumMet ? 'met' : 'not met'}
                    </p>
                  </div>
                  <MoveMotionAction
                    clubUnitId={clubUnitId}
                    meeting={m}
                    programYearId={programYearId}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
