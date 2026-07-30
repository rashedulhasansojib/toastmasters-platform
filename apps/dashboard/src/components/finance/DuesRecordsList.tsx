'use client';

import { useState } from 'react';
import { duesRecord, type DuesRecord } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

function RecordPaymentForm({
  clubUnitId,
  record,
  onSaved,
}: {
  clubUnitId: string;
  record: DuesRecord;
  onSaved: (record: DuesRecord) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function pay(scope: 'ti' | 'local') {
    const ledgerEntryId = window.prompt(
      'Ledger entry ID for this payment (record it in the ledger first)?',
    );
    if (!ledgerEntryId) return;
    const amount = window.prompt('Amount paid?');
    if (!amount) return;
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/dues-records/${record.id}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope, amount: Number(amount), ledgerEntryId }),
          }),
        {
          loading: 'Recording payment…',
          success: 'Payment recorded',
          error: 'Could not record that payment.',
        },
      );
      if (!result) return;
      onSaved(duesRecord.parse(await result.json()));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => pay('local')}
        disabled={submitting}
      >
        Record local payment
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => pay('ti')}
        disabled={submitting}
      >
        Record TI payment
      </Button>
    </div>
  );
}

export function DuesRecordsList({
  clubUnitId,
  records,
  onSaved,
}: {
  clubUnitId: string;
  records: DuesRecord[];
  onSaved: (record: DuesRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">No dues records yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {records.map((r, i) => (
          <div key={r.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {r.duesPeriod} — {r.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  TI {r.tiAmountPaid}/{r.tiAmountDue} {r.tiCurrency} · Local {r.localAmountPaid}/
                  {r.localAmountDue} {r.localCurrency}
                </p>
              </div>
              {r.status !== 'paid' && r.status !== 'waived' && (
                <RecordPaymentForm clubUnitId={clubUnitId} record={r} onSaved={onSaved} />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
