'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { PresidentContactLog, PresidentContactMethod } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

/** No area picker yet (scope cut) — the filing Area Director enters their own area's id. */
export function ContactLogPanel({
  clubUnitId,
  programYearId,
  logs,
}: {
  clubUnitId: string;
  programYearId: string | null;
  logs: PresidentContactLog[];
}) {
  const router = useRouter();
  const [areaUnitId, setAreaUnitId] = useState('');
  const [method, setMethod] = useState<PresidentContactMethod>('call');
  const [dcpDiscussed, setDcpDiscussed] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaUnitId || !programYearId) {
      toast.error('Missing area or program year.');
      return;
    }
    setSubmitting(true);
    try {
      const now = new Date();
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/contact-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              areaUnitId,
              programYearId,
              month: now.toISOString().slice(0, 7),
              contactedAt: now.toISOString(),
              method,
              dcpDiscussed,
            }),
          }),
        {
          loading: 'Logging contact…',
          success: 'Contact logged',
          error: 'Could not record that contact.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-area-unit-id">Area unit ID</Label>
          <Input
            id="contact-area-unit-id"
            value={areaUnitId}
            onChange={(e) => setAreaUnitId(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PresidentContactMethod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Input
            type="checkbox"
            className="w-4"
            checked={dcpDiscussed}
            onChange={(e) => setDcpDiscussed(e.target.checked)}
          />
          DCP discussed
        </label>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Recording…' : 'Log contact'}
        </Button>
      </form>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contact logged yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {logs.map((log, i) => (
              <div key={log.id}>
                {i > 0 && <Separator className="mb-3" />}
                <p className="font-medium">
                  {log.month} — {log.method} {log.dcpDiscussed && '· DCP discussed'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
