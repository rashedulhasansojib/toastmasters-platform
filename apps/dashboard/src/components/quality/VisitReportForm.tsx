'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AreaVisitRound, MomentOfTruthStandard } from '@toastmasters/contracts';
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
import { submitAction, toast } from '@/lib/toast';

const STANDARDS: MomentOfTruthStandard[] = [
  'first_impressions',
  'membership_orientation',
  'fellowship_variety_communication',
  'program_planning_meeting_organization',
  'membership_strength',
  'achievement_recognition',
];

/** No area picker yet (scope cut) — the filing Area Director enters their own area's id, which they already know from the unit switcher. */
export function VisitReportForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [areaUnitId, setAreaUnitId] = useState('');
  const [round, setRound] = useState<AreaVisitRound>('R1');
  const [visitedAt, setVisitedAt] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaUnitId || !programYearId) {
      toast.error('Missing area or program year.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/visit-reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              areaUnitId,
              programYearId,
              round,
              visitedAt,
              visitMode: 'in_person',
              momentsOfTruth: STANDARDS.map((standard) => ({
                standard,
                rating: ratings[standard] ?? 3,
                observations: '',
                recommendations: '',
              })),
            }),
          }),
        {
          loading: 'Filing visit report…',
          success: 'Visit report filed',
          error: 'Could not save that visit report.',
        },
      );
      if (!result) return;
      setVisitedAt('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="visit-area-unit-id">Area unit ID</Label>
          <Input
            id="visit-area-unit-id"
            value={areaUnitId}
            onChange={(e) => setAreaUnitId(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Round</Label>
          <Select value={round} onValueChange={(v) => setRound(v as AreaVisitRound)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="R1">R1</SelectItem>
              <SelectItem value="R2">R2</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="visit-date">Visited on</Label>
          <Input
            id="visit-date"
            type="date"
            value={visitedAt}
            onChange={(e) => setVisitedAt(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'File visit report'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {STANDARDS.map((standard) => (
          <label key={standard} className="flex items-center justify-between gap-2">
            <span>{standard.replaceAll('_', ' ')}</span>
            <Input
              type="number"
              min="1"
              max="5"
              className="w-16"
              value={ratings[standard] ?? 3}
              onChange={(e) =>
                setRatings((prev) => ({ ...prev, [standard]: Number(e.target.value) }))
              }
            />
          </label>
        ))}
      </div>
    </form>
  );
}
