'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown } from 'lucide-react';
import type { ActiveUnitSummary, SwitchableUnit } from '@toastmasters/contracts';

const TIER_LABEL: Record<string, string> = {
  international: 'International',
  region: 'Region',
  district: 'District',
  division: 'Division',
  area: 'Area',
  club: 'Club',
};

/**
 * Top-right unit picker. The active unit is always an option even when it
 * isn't in `units` — a plain club member's unit comes from their membership,
 * not from a role assignment, and a `<select>` whose value matches no option
 * renders blank.
 */
export function UnitSwitcher({
  units,
  activeUnit,
}: {
  units: SwitchableUnit[];
  activeUnit: ActiveUnitSummary | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  const options: ActiveUnitSummary[] =
    activeUnit && !units.some((unit) => unit.id === activeUnit.id) ? [activeUnit, ...units] : units;

  if (options.length === 0) return null;

  // Nothing to switch to — show where you are rather than a one-item dropdown.
  if (options.length === 1 && activeUnit) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted-foreground">
        <Building2 className="size-4 shrink-0" aria-hidden />
        <span className="max-w-40 truncate text-foreground sm:max-w-64">{activeUnit.name}</span>
      </span>
    );
  }

  async function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const orgUnitId = event.target.value;
    if (!orgUnitId || orgUnitId === activeUnit?.id) return;
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
    <div className="relative inline-flex items-center">
      <Building2
        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <select
        aria-label="Switch unit"
        value={activeUnit?.id ?? ''}
        onChange={onChange}
        disabled={switching}
        className="h-9 max-w-52 appearance-none truncate rounded-lg border border-border bg-background py-1.5 pr-8 pl-8.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:border-[#772432] focus-visible:ring-3 focus-visible:ring-[#772432]/20 focus-visible:outline-none disabled:opacity-60 sm:max-w-72"
      >
        {!activeUnit && <option value="">Select a unit…</option>}
        {options.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name} · {TIER_LABEL[unit.type] ?? unit.type}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}
