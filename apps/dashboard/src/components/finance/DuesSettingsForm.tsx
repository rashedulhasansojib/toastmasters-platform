'use client';

import { useState, type FormEvent } from 'react';
import type { ClubDuesSettings } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function DuesSettingsForm({
  clubUnitId,
  settings,
}: {
  clubUnitId: string;
  settings: ClubDuesSettings | null;
}) {
  const [localDuesAmount, setLocalDuesAmount] = useState(
    settings?.localDuesAmount != null ? String(settings.localDuesAmount) : '',
  );
  const [tiDuesAmount, setTiDuesAmount] = useState(
    settings?.tiDuesAmount != null ? String(settings.tiDuesAmount) : '',
  );
  const [currency, setCurrency] = useState(settings?.currency ?? 'USD');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/dues-settings`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              localDuesAmount: localDuesAmount ? Number(localDuesAmount) : undefined,
              tiDuesAmount: tiDuesAmount ? Number(tiDuesAmount) : undefined,
              currency: currency || undefined,
            }),
          }),
        {
          loading: 'Saving dues rates…',
          success: 'Dues rates saved',
          error: 'Could not save dues settings.',
        },
      );
      if (!result) return;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="local-dues-amount">Local dues (semiannual)</Label>
        <Input
          id="local-dues-amount"
          type="number"
          min="0"
          step="0.01"
          value={localDuesAmount}
          onChange={(e) => setLocalDuesAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ti-dues-amount">TI dues (semiannual)</Label>
        <Input
          id="ti-dues-amount"
          type="number"
          min="0"
          step="0.01"
          value={tiDuesAmount}
          onChange={(e) => setTiDuesAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dues-currency">Currency</Label>
        <Input id="dues-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save dues rates'}
      </Button>
    </form>
  );
}
