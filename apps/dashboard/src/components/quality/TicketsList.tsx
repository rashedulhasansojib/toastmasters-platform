'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticket } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function ResolveAction({ ticket }: { ticket: Ticket }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (ticket.status === 'resolved') return null;

  async function resolve() {
    const note = window.prompt('Resolution note?');
    if (!note) return;
    setBusy(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={resolve} disabled={busy}>
      Resolve
    </Button>
  );
}

export function TicketsList({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) {
    return <p className="text-sm text-muted-foreground">No tickets.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {tickets.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {t.title} ({t.severity}, {t.status})
                </p>
                <p className="text-sm text-muted-foreground">{t.body}</p>
              </div>
              <ResolveAction ticket={t} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
