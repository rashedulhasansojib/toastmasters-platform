'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { EducationRecord } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

function CreateForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [personId, setPersonId] = useState('');
  const [pathCode, setPathCode] = useState('PM');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/education-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId, pathCode }),
          }),
        {
          loading: 'Creating education record…',
          success: 'Education record created',
          error: 'Could not create that education record.',
        },
      );
      if (!result) return;
      setPersonId('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="edu-person-id">Person ID</Label>
        <Input
          id="edu-person-id"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edu-path-code">Path code</Label>
        <Input
          id="edu-path-code"
          value={pathCode}
          onChange={(e) => setPathCode(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Start education record'}
      </Button>
    </form>
  );
}

function LevelActions({
  clubUnitId,
  record,
  level,
}: {
  clubUnitId: string;
  record: EducationRecord;
  level: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const existing = record.levels.find((l) => l.level === level);

  async function markComplete() {
    setBusy(true);
    try {
      const result = await submitAction(
        () =>
          fetch(
            `/api/clubs/${clubUnitId}/education-records/${record.id}/levels/${level}/mark-complete`,
            { method: 'POST' },
          ),
        {
          loading: 'Marking level complete…',
          success: 'Level marked complete',
          error: 'Not all projects for this level are delivered yet.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/education-records/${record.id}/levels/${level}/confirm`, {
            method: 'POST',
          }),
        {
          loading: 'Confirming level…',
          success: 'Level confirmed',
          error: 'Could not confirm that level.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Level {level}:</span>
      {existing?.vpeConfirmedAt ? (
        <span className="text-green-600">confirmed</span>
      ) : existing?.memberMarkedCompleteAt ? (
        <>
          <span>marked complete, awaiting VPE</span>
          <Button type="button" variant="outline" size="sm" onClick={confirm} disabled={busy}>
            Confirm (VPE)
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={markComplete} disabled={busy}>
          Mark level complete
        </Button>
      )}
    </div>
  );
}

export function EducationRecordsPanel({
  clubUnitId,
  records,
}: {
  clubUnitId: string;
  records: EducationRecord[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <CreateForm clubUnitId={clubUnitId} />
      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No education records yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {records.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <Separator className="mb-3" />}
                <p className="font-medium">{r.pathCode}</p>
                <div className="flex flex-col gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <LevelActions key={level} clubUnitId={clubUnitId} record={r} level={level} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
