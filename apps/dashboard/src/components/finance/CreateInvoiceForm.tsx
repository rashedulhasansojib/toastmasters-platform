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

export function CreateInvoiceForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string | null;
}) {
  const router = useRouter();
  const [duesRecordIds, setDuesRecordIds] = useState('');
  const [issuedToKind, setIssuedToKind] = useState<'member' | 'guest' | 'external'>('member');
  const [issuedToName, setIssuedToName] = useState('');
  const [issuedToEmail, setIssuedToEmail] = useState('');
  const [dueOn, setDueOn] = useState('');
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
      const res = await fetch(`/api/clubs/${clubUnitId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programYearId,
          duesRecordIds: duesRecordIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
          issuedToKind,
          issuedToName,
          issuedToEmail: issuedToEmail || undefined,
          dueOn,
        }),
      });
      if (!res.ok) {
        setError('Could not create that invoice.');
        return;
      }
      setDuesRecordIds('');
      setIssuedToName('');
      setIssuedToEmail('');
      setDueOn('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-col gap-1">
        <Label htmlFor="invoice-dues-record-ids">Dues record IDs (comma-separated)</Label>
        <Input
          id="invoice-dues-record-ids"
          value={duesRecordIds}
          onChange={(e) => setDuesRecordIds(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Issued to</Label>
        <Select
          value={issuedToKind}
          onValueChange={(v) => setIssuedToKind(v as typeof issuedToKind)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
            <SelectItem value="external">External</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invoice-issued-to-name">Name</Label>
        <Input
          id="invoice-issued-to-name"
          value={issuedToName}
          onChange={(e) => setIssuedToName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invoice-issued-to-email">Email</Label>
        <Input
          id="invoice-issued-to-email"
          type="email"
          value={issuedToEmail}
          onChange={(e) => setIssuedToEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invoice-due-on">Due on</Label>
        <Input
          id="invoice-due-on"
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create invoice'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
