'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GuestPipelineStatus } from '@toastmasters/contracts';

import { submitAction, toast } from '@/lib/toast';
import { isMovableStatus } from './pipeline';

/**
 * Every pipeline write in one place, because the rules are not symmetric:
 *
 * - `contacted` / `interested` / `joined_meeting` / `not_interested` are a PATCH.
 * - `joined` is **not** patchable — it is set only by the conversion handler,
 *   so a move to that column becomes `POST …/convert`.
 * - `new` is the create-time default and is unreachable afterwards.
 *
 * Callers just say "put this guest in that column"; the asymmetry is
 * resolved here rather than in three separate components.
 */
export function useGuestActions(clubUnitId: string) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const moveTo = useCallback(
    async (guestId: string, target: GuestPipelineStatus): Promise<boolean> => {
      if (target === 'new') {
        toast.error('A guest cannot be moved back to New.');
        return false;
      }
      if (target !== 'joined' && !isMovableStatus(target)) {
        toast.error(`Cannot move a guest to ${target}.`);
        return false;
      }

      const base = `/api/clubs/${clubUnitId}/guests/${guestId}`;
      const request: RequestInit =
        target === 'joined'
          ? { method: 'POST' }
          : {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pipelineStatus: target }),
            };

      setPendingId(guestId);
      try {
        const result = await submitAction(
          () => fetch(target === 'joined' ? `${base}/convert` : base, request),
          {
            loading: target === 'joined' ? 'Converting guest…' : 'Updating guest…',
            success: target === 'joined' ? 'Guest converted to member' : 'Guest updated',
            error:
              target === 'joined'
                ? 'Could not convert this guest — they need an email on file.'
                : 'Could not update that guest.',
          },
        );
        if (!result) return false;
        router.refresh();
        return true;
      } finally {
        setPendingId(null);
      }
    },
    [clubUnitId, router],
  );

  const remove = useCallback(
    async (guestId: string): Promise<boolean> => {
      setPendingId(guestId);
      try {
        const result = await submitAction(
          async () => {
            const response = await fetch(`/api/clubs/${clubUnitId}/guests/${guestId}`, {
              method: 'DELETE',
            });
            if (response.status === 409) {
              throw new Error(
                'This guest has already converted to a member and cannot be deleted here.',
              );
            }
            return response;
          },
          {
            loading: 'Deleting guest…',
            success: 'Guest deleted',
            error: 'Could not delete that guest.',
          },
        );
        if (!result) return false;
        router.refresh();
        return true;
      } finally {
        setPendingId(null);
      }
    },
    [clubUnitId, router],
  );

  return { moveTo, remove, pendingId };
}
