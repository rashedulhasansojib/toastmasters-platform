'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InstallmentPlan } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

function PlanActions({ clubUnitId, plan }: { clubUnitId: string; plan: InstallmentPlan }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function payNext() {
    const nextEntry = plan.schedule.find((s) => !s.paidAt);
    if (!nextEntry) return;
    const ledgerEntryId = window.prompt(`Ledger entry ID for installment #${nextEntry.seq}?`);
    if (!ledgerEntryId) return;
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(
            `/api/clubs/${clubUnitId}/installment-plans/${plan.id}/schedule/${nextEntry.seq}/payments`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ledgerEntryId }),
            },
          ),
        {
          loading: 'Recording payment…',
          success: 'Payment recorded',
          error: 'Could not record that payment.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelPlan() {
    const reason = window.prompt('Reason for cancelling this plan?');
    if (!reason) return;
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/installment-plans/${plan.id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }),
        {
          loading: 'Cancelling plan…',
          success: 'Plan cancelled',
          error: 'Could not cancel that plan.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (plan.status !== 'active') return null;

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={payNext} disabled={submitting}>
        Record next payment
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={cancelPlan} disabled={submitting}>
        Cancel
      </Button>
    </div>
  );
}

export function InstallmentPlansList({
  clubUnitId,
  plans,
}: {
  clubUnitId: string;
  plans: InstallmentPlan[];
}) {
  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">No installment plans yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {plans.map((p, i) => (
          <div key={p.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {p.totalAmount} {p.currency} ({p.status})
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.schedule.filter((s) => s.paidAt).length}/{p.schedule.length} installments paid
                </p>
              </div>
              <PlanActions clubUnitId={clubUnitId} plan={p} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
