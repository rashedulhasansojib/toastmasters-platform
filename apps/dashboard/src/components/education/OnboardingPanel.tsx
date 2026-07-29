'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingTrack, OnboardingProgress } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function EnrollForm({ clubUnitId, tracks }: { clubUnitId: string; tracks: OnboardingTrack[] }) {
  const router = useRouter();
  const [personId, setPersonId] = useState('');
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trackId) {
      setError('No track selected.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/onboarding-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, trackId }),
      });
      if (!res.ok) {
        setError('Could not enrol that person.');
        return;
      }
      setPersonId('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No onboarding tracks yet — create one first.</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="onboard-person-id">Person ID</Label>
        <Input
          id="onboard-person-id"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="onboard-track">Track</Label>
        <select
          id="onboard-track"
          className="h-9 rounded-md border px-2 text-sm"
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.audience})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Enrolling…' : 'Enrol'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

function ProgressStep({
  clubUnitId,
  progress,
  step,
}: {
  clubUnitId: string;
  progress: OnboardingProgress;
  step: OnboardingProgress['steps'][number];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      await fetch(
        `/api/clubs/${clubUnitId}/onboarding-progress/${progress.id}/steps/${step.key}/complete`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{step.key}</span>
      {step.completedAt ? (
        <span className="text-green-600">done</span>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={complete} disabled={busy}>
          Mark done
        </Button>
      )}
    </div>
  );
}

function QuickCreateTrackButton({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    const name = window.prompt('Track name (e.g. "New Member Welcome")');
    if (!name) return;
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/onboarding-tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          audience: 'new_member',
          steps: [
            {
              key: 'meet-officers',
              order: 1,
              title: 'Meet the club officers',
              type: 'meet',
              body: null,
              libraryItemId: null,
              dueWithinDays: 14,
              isRequired: true,
            },
          ],
        }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={create} disabled={busy}>
      New onboarding track
    </Button>
  );
}

export function OnboardingPanel({
  clubUnitId,
  tracks,
  progress,
}: {
  clubUnitId: string;
  tracks: OnboardingTrack[];
  progress: OnboardingProgress[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <QuickCreateTrackButton clubUnitId={clubUnitId} />
      <EnrollForm clubUnitId={clubUnitId} tracks={tracks} />
      {progress.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one enrolled yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {progress.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <Separator className="mb-3" />}
                <p className="font-medium">{p.completedAt ? 'Complete' : 'In progress'}</p>
                <div className="flex flex-col gap-1">
                  {p.steps.map((s) => (
                    <ProgressStep key={s.key} clubUnitId={clubUnitId} progress={p} step={s} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
