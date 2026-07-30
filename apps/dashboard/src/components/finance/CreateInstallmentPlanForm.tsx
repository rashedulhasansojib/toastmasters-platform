'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function CreateInstallmentPlanForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [duesRecordId, setDuesRecordId] = useState('');
  const [installmentCount, setInstallmentCount] = useState('2');
  const [firstDueOn, setFirstDueOn] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/installment-plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              duesRecordId,
              installmentCount: Number(installmentCount),
              firstDueOn,
            }),
          }),
        {
          loading: 'Creating plan…',
          success: 'Plan created',
          error: 'Could not create that installment plan.',
        },
      );
      if (!result) return;
      setDuesRecordId('');
      setFirstDueOn('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="plan-dues-record-id">Dues record ID</Label>
        <Input
          id="plan-dues-record-id"
          value={duesRecordId}
          onChange={(e) => setDuesRecordId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="plan-installment-count">Installments</Label>
        <Input
          id="plan-installment-count"
          type="number"
          min="2"
          max="12"
          value={installmentCount}
          onChange={(e) => setInstallmentCount(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="plan-first-due-on">First installment due</Label>
        <Input
          id="plan-first-due-on"
          type="date"
          value={firstDueOn}
          onChange={(e) => setFirstDueOn(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create plan'}
      </Button>
    </form>
  );
}
