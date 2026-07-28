'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function SpeechSlotActions({
  clubUnitId,
  meetingId,
  speechSlotId,
}: {
  clubUnitId: string;
  meetingId: string;
  speechSlotId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'approved' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: 'approved' | 'declined') {
    setPending(status);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/speech-slots/${speechSlotId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        setError('Could not update that request.');
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={pending !== null} onClick={() => decide('approved')}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => decide('declined')}
      >
        Decline
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
