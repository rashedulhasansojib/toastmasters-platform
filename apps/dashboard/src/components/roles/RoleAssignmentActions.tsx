'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  const [error, setError] = useState<string | null>(null);

  async function decide(status: 'confirmed' | 'declined') {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/${roleAssignmentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            status === 'declined' && reason ? { status, declinedReason: reason } : { status },
          ),
        },
      );
      if (!res.ok) {
        setError('Could not update that role.');
        return;
      }
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
        {error && <p className="text-sm text-destructive">{error}</p>}
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
