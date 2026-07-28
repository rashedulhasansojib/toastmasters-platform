'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ballot } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function BallotCard({
  clubUnitId,
  meetingId,
  ballot,
}: {
  clubUnitId: string;
  meetingId: string;
  ballot: Ballot;
}) {
  const router = useRouter();
  const [candidatePersonId, setCandidatePersonId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote() {
    if (!candidatePersonId) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/ballots/${ballot.id}/votes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidatePersonId }),
        },
      );
      if (!res.ok) {
        setError('Could not cast that vote.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function tally() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/ballots/${ballot.id}/tally`,
        { method: 'POST' },
      );
      if (!res.ok) {
        setError('Could not tally this ballot.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{ballot.category.replaceAll('_', ' ')}</span>
        <span className="text-sm text-muted-foreground">{ballot.status}</span>
      </div>

      {ballot.status === 'open' && (
        <div className="flex flex-wrap items-end gap-2">
          <Select value={candidatePersonId ?? undefined} onValueChange={setCandidatePersonId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a candidate…" />
            </SelectTrigger>
            <SelectContent>
              {ballot.candidates.map((c) => (
                <SelectItem key={c.personId} value={c.personId}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" disabled={!candidatePersonId || pending} onClick={vote}>
            Vote
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={tally}>
            Tally &amp; close
          </Button>
        </div>
      )}

      {ballot.status === 'tallied' && ballot.tallyResult && (
        <div className="text-sm text-muted-foreground">
          <p>
            Winner:{' '}
            {ballot.candidates.find((c) => c.personId === ballot.tallyResult?.winnerPersonId)
              ?.label ?? '—'}
          </p>
          <ul>
            {ballot.tallyResult.tally.map((row) => (
              <li key={row.personId}>
                {ballot.candidates.find((c) => c.personId === row.personId)?.label ?? row.personId}:{' '}
                {row.count}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
