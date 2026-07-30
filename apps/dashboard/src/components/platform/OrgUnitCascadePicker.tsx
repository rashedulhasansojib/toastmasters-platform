'use client';

import { useEffect, useState } from 'react';
import type { OrgUnitWithCount } from '@toastmasters/contracts';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TIER_LABELS = ['District', 'Division', 'Area', 'Club'];

/**
 * Add User dialog's "which org unit" picker. One level at a time: level 0 is
 * the region's direct children (districts), and picking a unit at any level
 * either (a) reveals the next level down if it isn't a club, so the admin
 * can drill further, or (b) stops there — the last picked unit, whatever its
 * tier, is what onChange reports. Picking a club directly (skipping
 * division/area) works the same way as picking a district and stopping.
 */
export function OrgUnitCascadePicker({
  regionUnitId,
  onChange,
}: {
  regionUnitId: string;
  onChange: (unit: OrgUnitWithCount | null) => void;
}) {
  const [levels, setLevels] = useState<OrgUnitWithCount[][]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchChildren(regionUnitId, regionUnitId).then((children) => {
      if (!cancelled) {
        setLevels([children]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [regionUnitId]);

  async function fetchChildren(anchor: string, parentId: string): Promise<OrgUnitWithCount[]> {
    const response = await fetch(
      `/api/platform/${anchor}/org-tree?parentId=${encodeURIComponent(parentId)}`,
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.children ?? []) as OrgUnitWithCount[];
  }

  async function handleSelect(levelIndex: number, unitId: string): Promise<void> {
    const options = levels[levelIndex] ?? [];
    const unit = options.find((u) => u.id === unitId);
    if (!unit) return;

    const nextSelectedIds = [...selectedIds.slice(0, levelIndex), unitId];
    setSelectedIds(nextSelectedIds);
    onChange(unit);

    if (unit.type === 'club') {
      setLevels((prev) => prev.slice(0, levelIndex + 1));
      return;
    }
    const children = await fetchChildren(regionUnitId, unit.id);
    setLevels((prev) => [...prev.slice(0, levelIndex + 1), children]);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading org units…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {levels.map((options, levelIndex) => {
        if (options.length === 0) return null;
        const tierLabel = TIER_LABELS[levelIndex] ?? 'Unit';
        return (
          <div key={levelIndex} className="flex flex-col gap-1.5">
            <Label>{tierLabel}</Label>
            <Select
              items={Object.fromEntries(options.map((unit) => [unit.id, unit.name]))}
              value={selectedIds[levelIndex] ?? undefined}
              onValueChange={(value) => value && void handleSelect(levelIndex, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Select a ${tierLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
