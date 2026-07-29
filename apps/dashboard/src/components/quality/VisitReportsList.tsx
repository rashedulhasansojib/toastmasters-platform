'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AreaVisitReport } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function SubmitAction({ clubUnitId, report }: { clubUnitId: string; report: AreaVisitReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (report.status === 'submitted') return null;

  async function submit() {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/visit-reports/${report.id}/submit`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={submit} disabled={busy}>
      Submit
    </Button>
  );
}

export function VisitReportsList({
  clubUnitId,
  reports,
}: {
  clubUnitId: string;
  reports: AreaVisitReport[];
}) {
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No visit reports yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {reports.map((r, i) => (
          <div key={r.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {r.round} — {r.visitedAt} ({r.status})
                </p>
                <p className="text-sm text-muted-foreground">{r.visitMode}</p>
              </div>
              <SubmitAction clubUnitId={clubUnitId} report={r} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
