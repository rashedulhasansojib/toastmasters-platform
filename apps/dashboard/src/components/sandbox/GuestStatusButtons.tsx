'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SandboxGuestPipelineStatus } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

const NEXT_STATUS: Record<SandboxGuestPipelineStatus, SandboxGuestPipelineStatus | null> = {
  new: 'invited',
  invited: 'visited',
  visited: 'converted',
  converted: null,
};

const NEXT_LABEL: Record<SandboxGuestPipelineStatus, string> = {
  new: 'Mark invited',
  invited: 'Mark visited',
  visited: 'Convert to member',
  converted: '',
};

export function GuestStatusButtons({
  guestId,
  status,
}: {
  guestId: string;
  status: SandboxGuestPipelineStatus;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const next = NEXT_STATUS[status];
  if (!next) return null;

  async function advance() {
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/sandbox/guests/${guestId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pipelineStatus: next }),
          }),
        { loading: 'Updating…', success: 'Guest updated', error: 'Could not update guest' },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={submitting} onClick={advance}>
      {submitting ? 'Updating…' : NEXT_LABEL[status]}
    </Button>
  );
}
