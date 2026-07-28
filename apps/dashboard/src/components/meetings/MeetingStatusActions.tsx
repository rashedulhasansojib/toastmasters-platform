'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingStatus } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';

const TRANSITIONS: Record<MeetingStatus, { action: string; label: string }[]> = {
  draft: [
    { action: 'publish', label: 'Publish' },
    { action: 'cancel', label: 'Cancel' },
  ],
  published: [
    { action: 'start', label: 'Start meeting' },
    { action: 'cancel', label: 'Cancel' },
  ],
  in_progress: [{ action: 'close', label: 'Close meeting' }],
  closed: [],
  cancelled: [],
};

/** M3 Slice 11's guarded lifecycle: only the transitions valid from the current status render. The `close` guard (no proposed roles left) is enforced server-side — a 409 here surfaces as an inline error, not silently swallowed. */
export function MeetingStatusActions({
  clubUnitId,
  meetingId,
  status,
}: {
  clubUnitId: string;
  meetingId: string;
  status: MeetingStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Could not ${action} this meeting.`);
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const transitions = TRANSITIONS[status];
  if (transitions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {transitions.map(({ action, label }) => (
          <Button
            key={action}
            variant={action === 'cancel' ? 'destructive' : 'default'}
            disabled={pending !== null}
            onClick={() => run(action)}
          >
            {pending === action ? 'Working…' : label}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
