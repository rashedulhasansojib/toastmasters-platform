'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingStatus } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

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

const ACTION_TOASTS: Record<string, { loading: string; success: string }> = {
  publish: { loading: 'Publishing meeting…', success: 'Meeting published' },
  cancel: { loading: 'Cancelling meeting…', success: 'Meeting cancelled' },
  start: { loading: 'Starting meeting…', success: 'Meeting started' },
  close: { loading: 'Closing meeting…', success: 'Meeting closed' },
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

  async function run(action: string) {
    setPending(action);
    try {
      const toasts = ACTION_TOASTS[action] ?? {
        loading: `Running ${action}…`,
        success: `Meeting ${action}d`,
      };
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/${action}`, {
            method: 'POST',
          }),
        {
          loading: toasts.loading,
          success: toasts.success,
          error: `Could not ${action} this meeting.`,
        },
      );
      if (!result) return;
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
    </div>
  );
}
