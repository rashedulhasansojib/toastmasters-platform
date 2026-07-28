'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SwitchableUnit } from '@toastmasters/contracts';

export function UnitSwitcher({
  units,
  activeUnitId,
}: {
  units: SwitchableUnit[];
  activeUnitId: string | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  if (units.length === 0) return null;

  async function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const orgUnitId = event.target.value;
    if (!orgUnitId || orgUnitId === activeUnitId) return;
    setSwitching(true);
    try {
      await fetch('/api/session/switch-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgUnitId }),
      });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <select
      aria-label="Switch unit"
      value={activeUnitId ?? ''}
      onChange={onChange}
      disabled={switching}
    >
      {!activeUnitId && <option value="">Select a unit…</option>}
      {units.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {unit.name} ({unit.type})
        </option>
      ))}
    </select>
  );
}
