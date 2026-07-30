'use client';

import { useCallback, useState } from 'react';

/**
 * Mirrors a server-fetched list in client state so a mutation's own response
 * can update the UI immediately, instead of waiting on router.refresh() to
 * re-run every data fetch on the page. Resyncs from `source` whenever fresh
 * server props arrive (e.g. after a navigation), so effects a single
 * mutation's response can't know about — another section's data changing as
 * a side effect — still reconcile. Uses the "adjusting state during render"
 * pattern (not useEffect) so the resync lands in the same render as the new
 * props, without an extra render pass.
 */
export function useLocalCollection<T extends { id: string }>(source: T[]) {
  const [prevSource, setPrevSource] = useState(source);
  const [items, setItems] = useState(source);

  if (source !== prevSource) {
    setPrevSource(source);
    setItems(source);
  }

  const upsert = useCallback((item: T) => {
    setItems((prev) => {
      const exists = prev.some((existing) => existing.id === item.id);
      return exists
        ? prev.map((existing) => (existing.id === item.id ? item : existing))
        : [item, ...prev];
    });
  }, []);

  const upsertMany = useCallback((newItems: T[]) => {
    if (newItems.length === 0) return;
    setItems((prev) => {
      const ids = new Set(newItems.map((i) => i.id));
      return [...newItems, ...prev.filter((existing) => !ids.has(existing.id))];
    });
  }, []);

  return { items, upsert, upsertMany };
}
