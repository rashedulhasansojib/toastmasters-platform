'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SpeechEvaluation } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CreateForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState('');
  const [speakerPersonId, setSpeakerPersonId] = useState('');
  const [excelledAt, setExcelledAt] = useState('');
  const [workOn, setWorkOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          subjectKind: 'prepared_speech',
          speakerPersonId,
          mode: 'form',
          formScales: [{ criterion: 'overall', value: 4 }],
          formExcelledAt: excelledAt || undefined,
          formWorkOn: workOn || undefined,
          formChallengeYourself: 'Try a new project next time.',
          visibility: 'speaker_and_vpe',
        }),
      });
      if (!res.ok) {
        setError('Could not submit that evaluation.');
        return;
      }
      setMeetingId('');
      setSpeakerPersonId('');
      setExcelledAt('');
      setWorkOn('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="eval-meeting-id">Meeting ID</Label>
        <Input
          id="eval-meeting-id"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="eval-speaker-id">Speaker person ID</Label>
        <Input
          id="eval-speaker-id"
          value={speakerPersonId}
          onChange={(e) => setSpeakerPersonId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="eval-excelled">Excelled at</Label>
        <Input
          id="eval-excelled"
          value={excelledAt}
          onChange={(e) => setExcelledAt(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="eval-work-on">Work on</Label>
        <Input id="eval-work-on" value={workOn} onChange={(e) => setWorkOn(e.target.value)} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit evaluation'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function EvaluationsPanel({
  clubUnitId,
  myEvaluations,
}: {
  clubUnitId: string;
  myEvaluations: SpeechEvaluation[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <CreateForm clubUnitId={clubUnitId} />
      {myEvaluations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No evaluations of your speeches yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {myEvaluations.map((e, i) => (
              <div key={e.id}>
                {i > 0 && <Separator className="mb-3" />}
                <p className="font-medium">Excelled at: {e.formExcelledAt ?? '—'}</p>
                <p className="text-sm text-muted-foreground">Work on: {e.formWorkOn ?? '—'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
