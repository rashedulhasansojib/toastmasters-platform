'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ClubSuccessPlan } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CreatePlanForm({
  clubUnitId,
  programYearId,
}: {
  clubUnitId: string;
  programYearId: string;
}) {
  const router = useRouter();
  const [membershipTarget, setMembershipTarget] = useState('20');
  const [strengths, setStrengths] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/success-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programYearId,
          membershipTarget: Number(membershipTarget),
          strengths: strengths || undefined,
        }),
      });
      if (!res.ok) {
        setError('Could not create the plan.');
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="csp-membership-target">Membership target</Label>
        <Input
          id="csp-membership-target"
          type="number"
          value={membershipTarget}
          onChange={(e) => setMembershipTarget(e.target.value)}
        />
      </div>
      <div className="flex min-w-64 flex-col gap-1">
        <Label htmlFor="csp-strengths">Strengths</Label>
        <Input
          id="csp-strengths"
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Club Success Plan'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

function SubmitPlanButton({ clubUnitId, plan }: { clubUnitId: string; plan: ClubSuccessPlan }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (plan.status !== 'draft') return null;

  async function submit() {
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubUnitId}/success-plan/${plan.id}/submit`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={submit} disabled={busy}>
      Submit to TI
    </Button>
  );
}

export function ClubSuccessPlanPanel({
  clubUnitId,
  programYearId,
  plan,
}: {
  clubUnitId: string;
  programYearId: string | null;
  plan: ClubSuccessPlan | null;
}) {
  if (!programYearId) {
    return <p className="text-sm text-muted-foreground">No active program year for this unit.</p>;
  }
  if (!plan) {
    return <CreatePlanForm clubUnitId={clubUnitId} programYearId={programYearId} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">
        Status: {plan.status} · Membership target: {plan.membershipTarget}
      </p>
      {plan.strengths && (
        <p className="text-sm text-muted-foreground">Strengths: {plan.strengths}</p>
      )}
      <SubmitPlanButton clubUnitId={clubUnitId} plan={plan} />
    </div>
  );
}
