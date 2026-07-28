'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FinancialReport } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

function FinalizeButton({ clubUnitId, report }: { clubUnitId: string; report: FinancialReport }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  if (report.status === 'final') return null;

  async function onClick() {
    setSubmitting(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/financial-reports/${report.id}/finalize`, {
        method: 'POST',
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={submitting}>
      Finalize
    </Button>
  );
}

export function FinancialReportsList({
  clubUnitId,
  reports,
}: {
  clubUnitId: string;
  reports: FinancialReport[];
}) {
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No financial reports yet.</p>;
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
                  {r.type} ({r.periodFrom} – {r.periodTo}) — {r.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  Opening {r.openingBalance} → closing {r.closingBalance} {r.currency}
                </p>
              </div>
              <FinalizeButton clubUnitId={clubUnitId} report={r} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
