'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BallotCategory, BallotEligibility } from '@toastmasters/contracts';
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
import { submitAction } from '@/lib/toast';

const CATEGORIES: BallotCategory[] = [
  'best_speaker',
  'best_table_topic',
  'best_evaluator',
  'best_role_player',
];
const ELIGIBILITY: BallotEligibility[] = ['members_present', 'all_present'];

type DraftCandidate = { personId: string; label: string };

export function CreateBallotForm({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<BallotCategory>('best_speaker');
  const [eligibility, setEligibility] = useState<BallotEligibility>('members_present');
  const [candidates, setCandidates] = useState<DraftCandidate[]>([
    { personId: '', label: '' },
    { personId: '', label: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  function updateCandidate(index: number, patch: Partial<DraftCandidate>) {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/ballots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, eligibility, candidates }),
          }),
        {
          loading: 'Opening ballot…',
          success: 'Ballot opened',
          error: 'Could not open that ballot.',
        },
      );
      if (!result) return;
      setCandidates([
        { personId: '', label: '' },
        { personId: '', label: '' },
      ]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Award</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as BallotCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Eligible voters</Label>
          <Select value={eligibility} onValueChange={(v) => setEligibility(v as BallotEligibility)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELIGIBILITY.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {candidates.map((candidate, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`candidate-person-${i}`}>Candidate {i + 1} person ID</Label>
              <Input
                id={`candidate-person-${i}`}
                value={candidate.personId}
                onChange={(e) => updateCandidate(i, { personId: e.target.value })}
                placeholder="uuid"
                className="w-64"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`candidate-label-${i}`}>Display name</Label>
              <Input
                id={`candidate-label-${i}`}
                value={candidate.label}
                onChange={(e) => updateCandidate(i, { label: e.target.value })}
                required
              />
            </div>
            {candidates.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCandidates((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setCandidates((prev) => [...prev, { personId: '', label: '' }])}
        >
          Add candidate
        </Button>
      </div>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Opening…' : 'Open ballot'}
        </Button>
      </div>
    </form>
  );
}
