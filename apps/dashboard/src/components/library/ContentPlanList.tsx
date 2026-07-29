'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentPlanItem } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function ItemActions({ clubUnitId, item }: { clubUnitId: string; item: ContentPlanItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/content-plan/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const publishedUrl = window.prompt('URL where this was posted?');
    if (!publishedUrl) return;
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/content-plan/${item.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishedUrl }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (item.status === 'published' || item.status === 'cancelled') return null;

  return (
    <div className="flex gap-2">
      {item.status === 'idea' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setStatus('drafting')}
          disabled={busy}
        >
          Start drafting
        </Button>
      )}
      {item.status === 'drafting' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setStatus('ready')}
          disabled={busy}
        >
          Mark ready
        </Button>
      )}
      {item.status === 'ready' && (
        <Button type="button" variant="outline" size="sm" onClick={publish} disabled={busy}>
          Record as published
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setStatus('cancelled')}
        disabled={busy}
      >
        Cancel
      </Button>
    </div>
  );
}

export function ContentPlanList({
  clubUnitId,
  items,
}: {
  clubUnitId: string;
  items: ContentPlanItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing planned yet.</p>;
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
                  {item.title} · {item.channel} ({item.status})
                </p>
                <p className="text-sm text-muted-foreground">
                  Scheduled {new Date(item.scheduledFor).toLocaleString()}
                  {item.publishedUrl && ` · ${item.publishedUrl}`}
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
