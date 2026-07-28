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

export function CreateLedgerEntryForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [occurredOn, setOccurredOn] = useState('');
  const [counterpartyLabel, setCounterpartyLabel] = useState('');
  const [description, setDescription] = useState('');
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
      const res = await fetch(`/api/clubs/${clubUnitId}/ledger-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programYearId,
          direction,
          category,
          amount: Number(amount),
          currency,
          occurredOn,
          counterpartyKind: 'other',
          counterpartyLabel,
          description,
        }),
      });
      if (!res.ok) {
        setError('Could not record that entry.');
        return;
      }
      setCategory('');
      setAmount('');
      setOccurredOn('');
      setCounterpartyLabel('');
      setDescription('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label>Direction</Label>
        <Select value={direction} onValueChange={(v) => setDirection(v as 'in' | 'out')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">Income</SelectItem>
            <SelectItem value="out">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ledger-category">Category</Label>
        <Input
          id="ledger-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ledger-amount">Amount</Label>
        <Input
          id="ledger-amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ledger-currency">Currency</Label>
        <Input
          id="ledger-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ledger-occurred-on">Date</Label>
        <Input
          id="ledger-occurred-on"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ledger-counterparty">Counterparty</Label>
        <Input
          id="ledger-counterparty"
          value={counterpartyLabel}
          onChange={(e) => setCounterpartyLabel(e.target.value)}
          required
        />
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="ledger-description">Description</Label>
        <Input
          id="ledger-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Recording…' : 'Record entry'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
