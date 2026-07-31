'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OrgUnit, OrgUnitType } from '@toastmasters/contracts';

import { Label } from '@/components/ui/label';
import { OrgUnitCombobox } from './OrgUnitCombobox';

type FieldType = 'district' | 'division' | 'area' | 'club';

const FIELD_TYPES: FieldType[] = ['district', 'division', 'area', 'club'];
const FIELD_TYPE_SET: Set<OrgUnitType> = new Set(FIELD_TYPES);
const FIELD_LABELS: Record<FieldType, string> = {
  district: 'District',
  division: 'Division',
  area: 'Area',
  club: 'Club',
};

/** True when `a` and `b` sit on the same root-to-leaf branch — one is the other's ancestor, descendant, or itself. Skip-level trees (a club hung directly off a district) are still handled correctly since this is pure path-prefix containment, not a fixed depth check. */
function samePathBranch(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

function isStrictAncestorPath(ancestorPath: string, path: string): boolean {
  return path.startsWith(`${ancestorPath}.`);
}

/**
 * Add User dialog's "which org unit" picker. All four tiers (District,
 * Division, Area, Club) are visible and editable at once — the admin can
 * start from whichever one they know. Picking a unit fills in its real
 * ancestors (derived from the fetched tree, not guessed) and clears any
 * previously-picked descendant that's no longer on the same branch; picking a
 * higher tier re-scopes the lower comboboxes' options to that subtree without
 * forcing a re-pick if the existing lower selection still fits.
 */
export function OrgUnitFieldsPicker({
  regionUnitId,
  onChange,
}: {
  regionUnitId: string;
  onChange: (unit: OrgUnit | null) => void;
}) {
  const [tree, setTree] = useState<OrgUnit[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Partial<Record<FieldType, string>>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/platform/${regionUnitId}/console`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data) => {
        if (cancelled) return;
        const units = ((data.tree ?? []) as OrgUnit[]).filter((u) => FIELD_TYPE_SET.has(u.type));
        setTree(units);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [regionUnitId]);

  const byId = useMemo(() => {
    const map = new Map<string, OrgUnit>();
    for (const unit of tree ?? []) map.set(unit.id, unit);
    return map;
  }, [tree]);

  const byType = useMemo(() => {
    const map = new Map<FieldType, OrgUnit[]>();
    for (const unit of tree ?? []) {
      if (!FIELD_TYPE_SET.has(unit.type)) continue;
      const type = unit.type as FieldType;
      const list = map.get(type) ?? [];
      list.push(unit);
      map.set(type, list);
    }
    return map;
  }, [tree]);

  function optionsFor(type: FieldType): OrgUnit[] {
    const all = byType.get(type) ?? [];
    const otherUnits = FIELD_TYPES.filter((t) => t !== type && selected[t])
      .map((t) => byId.get(selected[t]!))
      .filter((u): u is OrgUnit => u !== undefined);
    if (otherUnits.length === 0) return all;
    return all.filter((candidate) =>
      otherUnits.every((u) => samePathBranch(candidate.path, u.path)),
    );
  }

  function applySelection(type: FieldType, id: string | null): void {
    const next = { ...selected };
    if (!id) {
      delete next[type];
      setSelected(next);
      reportChange(next);
      return;
    }
    const unit = byId.get(id);
    if (!unit) return;
    next[type] = id;

    const idx = FIELD_TYPES.indexOf(type);
    // Descendant tiers: keep the existing pick only if it's still on the same
    // branch as the newly picked unit; otherwise it no longer makes sense.
    for (const descendantType of FIELD_TYPES.slice(idx + 1)) {
      const curId = next[descendantType];
      const curUnit = curId ? byId.get(curId) : undefined;
      if (!curUnit || !samePathBranch(curUnit.path, unit.path)) delete next[descendantType];
    }
    // Ancestor tiers: always derive from the real tree, overwriting whatever
    // was there — a picked unit's true lineage is authoritative. A tier that
    // doesn't exist in this branch (skipped, e.g. a club straight under a
    // district) is left blank rather than guessed.
    for (const ancestorType of FIELD_TYPES.slice(0, idx)) {
      const candidate = (byType.get(ancestorType) ?? []).find((u) =>
        isStrictAncestorPath(u.path, unit.path),
      );
      if (candidate) next[ancestorType] = candidate.id;
      else delete next[ancestorType];
    }

    setSelected(next);
    reportChange(next);
  }

  function reportChange(next: Partial<Record<FieldType, string>>): void {
    const mostSpecificType = [...FIELD_TYPES].reverse().find((t) => next[t]);
    const unit = mostSpecificType ? (byId.get(next[mostSpecificType]!) ?? null) : null;
    onChange(unit);
  }

  if (loadError) {
    return <p className="text-sm text-destructive">Could not load org units.</p>;
  }
  if (!tree) {
    return <p className="text-sm text-muted-foreground">Loading org units…</p>;
  }

  const visibleTypes = FIELD_TYPES.filter((t) => (byType.get(t) ?? []).length > 0);

  return (
    <div className="flex flex-col gap-3">
      {visibleTypes.map((type) => (
        <div key={type} className="flex flex-col gap-1.5">
          <Label>{FIELD_LABELS[type]}</Label>
          <OrgUnitCombobox
            items={optionsFor(type)}
            value={selected[type] ?? null}
            onChange={(id) => applySelection(type, id)}
            placeholder={`Select a ${FIELD_LABELS[type].toLowerCase()}`}
            emptyMessage={`No ${FIELD_LABELS[type].toLowerCase()} matches the current selection.`}
          />
        </div>
      ))}
    </div>
  );
}
