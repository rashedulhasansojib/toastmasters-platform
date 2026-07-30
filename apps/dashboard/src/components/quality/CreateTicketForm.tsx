'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketSeverity } from '@toastmasters/contracts';
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

export function CreateTicketForm({ defaultScopeUnitId }: { defaultScopeUnitId: string | null }) {
  const router = useRouter();
  const [scopeUnitId, setScopeUnitId] = useState(defaultScopeUnitId ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<TicketSeverity>('medium');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/tickets?scope=${encodeURIComponent(scopeUnitId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scopeUnitId, title, body, severity }),
          }),
        {
          loading: 'Opening ticket…',
          success: 'Ticket opened',
          error: 'Could not create that ticket.',
        },
      );
      if (!result) return;
      setTitle('');
      setBody('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="ticket-scope">Scope unit ID</Label>
        <Input
          id="ticket-scope"
          value={scopeUnitId}
          onChange={(e) => setScopeUnitId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ticket-title">Title</Label>
        <Input
          id="ticket-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="flex min-w-64 flex-col gap-1">
        <Label htmlFor="ticket-body">Body</Label>
        <Input id="ticket-body" value={body} onChange={(e) => setBody(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Severity</Label>
        <Select value={severity} onValueChange={(v) => setSeverity(v as TicketSeverity)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Open ticket'}
      </Button>
    </form>
  );
}
