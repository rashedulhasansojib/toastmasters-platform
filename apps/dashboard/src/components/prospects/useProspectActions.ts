'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProspectPipelineStatus } from '@toastmasters/contracts';

import { isMovableStatus } from './pipeline';

/**
 * Every pipeline write in one place, because the rules are not symmetric:
 *
 * - `contacted` / `interested` / `not_interested` are a PATCH.
 * - `joined` is **not** patchable — it is set only by the conversion handler,
 *   so a move to that column becomes `POST …/convert`.
 * - `new` is the create-time default and is unreachable afterwards.
 *
 * Callers just say "put this prospect in that column"; the asymmetry is
 * resolved here rather than in three separate components.
 */
export function useProspectActions(clubUnitId: string) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const moveTo = useCallback(
    async (prospectId: string, target: ProspectPipelineStatus): Promise<boolean> => {
      const base = `/api/clubs/${clubUnitId}/prospects/${prospectId}`;
      const request: RequestInit =
        target === 'joined'
          ? { method: 'POST' }
          : {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pipelineStatus: target }),
            };

      if (target === 'new') {
        setError('A prospect cannot be moved back to New.');
        return false;
      }
      if (target !== 'joined' && !isMovableStatus(target)) {
        setError(`Cannot move a prospect to ${target}.`);
        return false;
      }

      setError(null);
      setPendingId(prospectId);
      try {
        const response = await fetch(target === 'joined' ? `${base}/convert` : base, request);
        if (!response.ok) {
          setError(
            target === 'joined'
              ? 'Could not convert this prospect — they need an email on file.'
              : 'Could not update that prospect.',
          );
          return false;
        }
        router.refresh();
        return true;
      } catch {
        setError('Network error — that change was not saved.');
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [clubUnitId, router],
  );

  return { moveTo, pendingId, error, clearError: () => setError(null) };
}
