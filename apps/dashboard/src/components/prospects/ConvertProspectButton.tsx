'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Prospect } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';

export function ConvertProspectButton({
  clubUnitId,
  prospect,
}: {
  clubUnitId: string;
  prospect: Prospect;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (prospect.pipelineStatus === 'joined') {
    return null;
  }

  async function onClick() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/prospects/${prospect.id}/convert`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError('Could not convert this prospect — do they have an email on file?');
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" onClick={onClick} disabled={submitting}>
        {submitting ? 'Converting…' : 'Convert to member'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
