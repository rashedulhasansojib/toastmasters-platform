'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

export function CompleteProjectButton({
  memberId,
  disabled,
}: {
  memberId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function markComplete() {
    setSubmitting(true);
    try {
      const result = await submitAction(
        () => fetch(`/api/sandbox/education/${memberId}/complete-project`, { method: 'POST' }),
        {
          loading: 'Marking project complete…',
          success: 'Project marked complete',
          error: 'Could not update progress',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={disabled || submitting} onClick={markComplete}>
      {disabled ? 'Pathway complete' : submitting ? 'Updating…' : 'Mark project complete'}
    </Button>
  );
}
