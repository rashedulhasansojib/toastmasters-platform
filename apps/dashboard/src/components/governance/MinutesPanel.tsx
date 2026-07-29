'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Minutes } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function MinutesActions({ clubUnitId, item }: { clubUnitId: string; item: Minutes }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/minutes/${item.id}/approve`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/minutes/${item.id}/publish`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {!item.approvedAt && (
        <Button type="button" variant="outline" size="sm" onClick={approve} disabled={busy}>
          Approve (next meeting)
        </Button>
      )}
      {item.approvedAt && !item.publishedAt && (
        <Button type="button" variant="outline" size="sm" onClick={publish} disabled={busy}>
          Publish to library
        </Button>
      )}
    </div>
  );
}

export function MinutesPanel({ clubUnitId, items }: { clubUnitId: string; items: Minutes[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No minutes drafted yet.</p>;
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
                  v{item.version} — {item.sourceKind} ({item.visibility})
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.approvedAt ? 'Approved' : 'Draft'}
                  {item.publishedAt && ' · Published'}
                </p>
              </div>
              <MinutesActions clubUnitId={clubUnitId} item={item} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
