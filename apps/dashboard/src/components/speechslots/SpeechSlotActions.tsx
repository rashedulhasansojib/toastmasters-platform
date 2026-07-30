'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

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

  async function decide(status: 'approved' | 'declined') {
    setPending(status);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/speech-slots/${speechSlotId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          }),
        {
          loading: status === 'approved' ? 'Approving slot…' : 'Declining slot…',
          success: status === 'approved' ? 'Slot approved' : 'Slot declined',
          error: 'Could not update that request.',
        },
      );
      if (!result) return;
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
    </div>
  );
}
