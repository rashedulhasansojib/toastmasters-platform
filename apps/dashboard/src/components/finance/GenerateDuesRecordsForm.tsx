'use client';

import { useState, type FormEvent } from 'react';
import { duesRecord, type DuesRecord } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction, toast } from '@/lib/toast';

export function GenerateDuesRecordsForm({
  clubUnitId,
  programYearId,
  onGenerated,
}: {
  clubUnitId: string;
  programYearId: string | null;
  onGenerated: (records: DuesRecord[]) => void;
}) {
  const [duesPeriod, setDuesPeriod] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programYearId) {
      toast.error('No active program year for this unit.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/dues-records/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duesPeriod, programYearId }),
          }),
        {
          loading: 'Generating dues records…',
          success: 'Dues records generated',
          error: 'Could not generate dues records.',
        },
      );
      if (!result) return;
      setDuesPeriod('');
      onGenerated(duesRecord.array().parse(await result.json()));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="dues-period">Dues period</Label>
        <Input
          id="dues-period"
          placeholder="2026-OCT"
          value={duesPeriod}
          onChange={(e) => setDuesPeriod(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Generating…' : 'Generate dues records'}
      </Button>
    </form>
  );
}
