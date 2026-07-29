'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItem, InventoryMovementType } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function ItemActions({ clubUnitId, item }: { clubUnitId: string; item: InventoryItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function move(type: InventoryMovementType, needsQuantity: boolean) {
    let quantity = 0;
    if (needsQuantity) {
      const raw = window.prompt(`How many (${type})?`);
      if (!raw) return;
      quantity = Number(raw);
    }
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/inventory/${item.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, quantity }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => move('acquire', true)}
        disabled={busy}
      >
        Acquire
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => move('checkout', false)}
        disabled={busy}
      >
        Check out
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => move('return', false)}
        disabled={busy}
      >
        Return
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => move('audit', false)}
        disabled={busy}
      >
        Mark audited
      </Button>
    </div>
  );
}

export function InventoryList({
  clubUnitId,
  items,
}: {
  clubUnitId: string;
  items: InventoryItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No inventory recorded yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={item.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {item.name} — {item.quantity} {item.unit} ({item.condition})
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.category} · {item.location ?? 'no location set'}
                  {item.custodianPersonId && ` · checked out`}
                </p>
              </div>
              <ItemActions clubUnitId={clubUnitId} item={item} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
