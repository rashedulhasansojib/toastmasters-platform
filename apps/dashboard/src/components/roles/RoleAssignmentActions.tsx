'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitAction } from '@/lib/toast';

export function RoleAssignmentActions({
  clubUnitId,
  meetingId,
  roleAssignmentId,
}: {
  clubUnitId: string;
  meetingId: string;
  roleAssignmentId: string;
}) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  async function decide(status: 'confirmed' | 'declined') {
    setPending(true);
    try {
      const result = await submitAction(
        () =>
          fetch(
            `/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/${roleAssignmentId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                status === 'declined' && reason ? { status, declinedReason: reason } : { status },
              ),
            },
          ),
        {
          loading: 'Updating role…',
          success: 'Role updated',
          error: 'Could not update that role.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (declining) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-48"
        />
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => decide('declined')}
        >
          Confirm decline
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeclining(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => decide('confirmed')}>
        Confirm
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
        Decline
      </Button>
    </div>
  );
}
