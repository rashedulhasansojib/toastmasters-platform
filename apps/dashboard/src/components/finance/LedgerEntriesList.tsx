'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LedgerEntry } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function ReverseEntryButton({ clubUnitId, entryId }: { clubUnitId: string; entryId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function onClick() {
    const reason = window.prompt('Reason for reversal?');
    if (!reason) return;
    setSubmitting(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/ledger-entries/${entryId}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={submitting}>
      Reverse
    </Button>
  );
}

export function LedgerEntriesList({
  clubUnitId,
  entries,
}: {
  clubUnitId: string;
  entries: LedgerEntry[];
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No ledger entries yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {entries.map((e, i) => (
          <div key={e.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {e.direction === 'in' ? '+' : '-'}
                  {e.amount} {e.currency} — {e.category}
                </p>
                <p className="text-sm text-muted-foreground">
                  {e.occurredOn} · {e.counterpartyLabel} · {e.description}
                  {e.reversalOfEntryId && ' · reversal'}
                </p>
              </div>
              {!e.reversalOfEntryId && (
                <ReverseEntryButton clubUnitId={clubUnitId} entryId={e.id} />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
