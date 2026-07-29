'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryItem } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function ItemActions({
  clubUnitId,
  item,
  isGovernance,
}: {
  clubUnitId: string;
  item: LibraryItem;
  isGovernance: boolean;
}) {
  const router = useRouter();
  const base = isGovernance ? 'governance-documents' : 'library-items';
  const [busy, setBusy] = useState(false);

  async function openFile() {
    const res = await fetch(`/api/clubs/${clubUnitId}/${base}/${item.id}/download-url`);
    if (!res.ok) return;
    const { url } = (await res.json()) as { url: string };
    window.open(url, '_blank');
  }

  async function archive() {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/${base}/${item.id}/archive`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {item.fileUrl && (
        <Button type="button" variant="outline" size="sm" onClick={openFile}>
          Open
        </Button>
      )}
      {item.externalUrl && (
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
        >
          Open link
        </a>
      )}
      <Button type="button" variant="outline" size="sm" onClick={archive} disabled={busy}>
        Archive
      </Button>
    </div>
  );
}

export function LibraryItemsList({
  clubUnitId,
  items,
  isGovernance = false,
}: {
  clubUnitId: string;
  items: LibraryItem[];
  isGovernance?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items yet.</p>;
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
                  {item.title} · v{item.version}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.kind} · {item.category}
                  {item.reviewBy && ` · review by ${item.reviewBy}`}
                </p>
              </div>
              <ItemActions clubUnitId={clubUnitId} item={item} isGovernance={isGovernance} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
