'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function GenerateDuesRecordsForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [duesPeriod, setDuesPeriod] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programYearId) {
      setError('No active program year for this unit.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/dues-records/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duesPeriod, programYearId }),
      });
      if (!res.ok) {
        setError('Could not generate dues records.');
        return;
      }
      setDuesPeriod('');
      router.refresh();
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
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
