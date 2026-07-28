'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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

type ReportType = 'monthly' | 'quarterly' | 'annual' | 'handover';

export function GenerateReportForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [type, setType] = useState<ReportType>('monthly');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
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
      const res = await fetch(`/api/clubs/${clubUnitId}/financial-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programYearId, type, periodFrom, periodTo }),
      });
      if (!res.ok) {
        setError('Could not generate that report.');
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
            <SelectItem value="handover">Handover</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="report-period-from">From</Label>
        <Input
          id="report-period-from"
          type="date"
          value={periodFrom}
          onChange={(e) => setPeriodFrom(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="report-period-to">To</Label>
        <Input
          id="report-period-to"
          type="date"
          value={periodTo}
          onChange={(e) => setPeriodTo(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Generating…' : 'Generate report'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
