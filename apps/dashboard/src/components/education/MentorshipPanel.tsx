'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { MentorshipPairing, MentorshipPurpose } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function CreateForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [mentorPersonId, setMentorPersonId] = useState('');
  const [menteePersonId, setMenteePersonId] = useState('');
  const [purpose, setPurpose] = useState<MentorshipPurpose>('new_member_onboarding');
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
      const res = await fetch(`/api/clubs/${clubUnitId}/mentorship/pairings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programYearId, mentorPersonId, menteePersonId, purpose }),
      });
      if (!res.ok) {
        setError('Could not create that pairing.');
        return;
      }
      setMentorPersonId('');
      setMenteePersonId('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="mentor-id">Mentor person ID</Label>
        <Input
          id="mentor-id"
          value={mentorPersonId}
          onChange={(e) => setMentorPersonId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="mentee-id">Mentee person ID</Label>
        <Input
          id="mentee-id"
          value={menteePersonId}
          onChange={(e) => setMenteePersonId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Purpose</Label>
        <Select value={purpose} onValueChange={(v) => setPurpose(v as MentorshipPurpose)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new_member_onboarding">New member onboarding</SelectItem>
            <SelectItem value="pathway_project">Pathway project</SelectItem>
            <SelectItem value="contest_prep">Contest prep</SelectItem>
            <SelectItem value="officer_transition">Officer transition</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Pairing…' : 'Create pairing'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

function EndAction({ clubUnitId, pairing }: { clubUnitId: string; pairing: MentorshipPairing }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (pairing.status === 'ended' || pairing.status === 'completed') return null;

  async function end() {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/mentorship/pairings/${pairing.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'completed' }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={end} disabled={busy}>
      End pairing
    </Button>
  );
}

export function MentorshipPanel({
  clubUnitId,
  programYearId,
  pairings,
}: {
  clubUnitId: string;
  programYearId: string | null;
  pairings: MentorshipPairing[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <CreateForm clubUnitId={clubUnitId} programYearId={programYearId} />
      {pairings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mentorship pairings yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {pairings.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {p.purpose} ({p.status})
                  </p>
                  <EndAction clubUnitId={clubUnitId} pairing={p} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
