'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Prospect } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type UpdatableStatus = 'contacted' | 'interested' | 'not_interested';
const OPTIONS: Array<{ value: UpdatableStatus; label: string }> = [
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
];

export function UpdateProspectStatusForm({
  clubUnitId,
  prospect,
}: {
  clubUnitId: string;
  prospect: Prospect;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<UpdatableStatus>(
    prospect.pipelineStatus === 'new' ? 'contacted' : (prospect.pipelineStatus as UpdatableStatus),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/prospects/${prospect.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStatus: status }),
      });
      if (!res.ok) {
        setError('Could not update status.');
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (prospect.pipelineStatus === 'joined') {
    return <p className="text-sm text-muted-foreground">This prospect has joined the club.</p>;
  }

  return (
    <div className="flex items-end gap-3">
      <Select value={status} onValueChange={(v) => setStatus(v as UpdatableStatus)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" onClick={apply} disabled={submitting}>
        {submitting ? 'Updating…' : 'Update status'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
