'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  conventionalChildTier,
  orgUnitTierRank,
  orgUnitType,
  type OrgUnit,
  type OrgUnitType,
} from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mode = { kind: 'add' | 'rename'; unitId: string } | null;

/** A 409 from the delete route carries the relations standing in the way. */
interface DeleteBlocker {
  relation: string;
  count: number;
}

function isBlockerList(value: unknown): value is DeleteBlocker[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as DeleteBlocker).relation === 'string' &&
        typeof (entry as DeleteBlocker).count === 'number',
    )
  );
}

/**
 * Turns an error response into a sentence. Nest nests a ConflictException's
 * object payload one level down, under `message`, so the blockers can arrive
 * at either `body.blockers` or `body.message.blockers`.
 */
async function describeFailure(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => ({}));
  const outer = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const inner =
    typeof outer.message === 'object' && outer.message !== null
      ? (outer.message as Record<string, unknown>)
      : {};

  const blockers = isBlockerList(inner.blockers)
    ? inner.blockers
    : isBlockerList(outer.blockers)
      ? outer.blockers
      : null;
  if (blockers?.length) {
    return `Not empty — still holds ${blockers.map((b) => `${b.count} ${b.relation}`).join(', ')}.`;
  }

  if (typeof outer.message === 'string') return outer.message;
  if (typeof inner.message === 'string') return inner.message;
  return `Request failed (${response.status})`;
}

export function OrgTreeManager({ region, tree }: { region: OrgUnit; tree: OrgUnit[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const units = [region, ...tree];

  async function send(path: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, init);
      if (!response.ok) {
        setError(await describeFailure(response));
        return false;
      }
      setMode(null);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {units.map((unit) => {
        const isRoot = unit.id === region.id;
        return (
          <div key={unit.id} className="flex flex-col gap-1">
            <div
              className="flex items-center justify-between gap-3 py-1"
              style={{ paddingLeft: `${unit.depth * 1.25}rem` }}
            >
              <div className="min-w-0">
                <span className={isRoot ? 'font-semibold' : 'font-medium'}>{unit.name}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {unit.type} · {unit.code}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {conventionalChildTier[unit.type] && (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setMode({ kind: 'add', unitId: unit.id })}
                    aria-label={`Add child under ${unit.name}`}
                  >
                    <Plus /> Add
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setMode({ kind: 'rename', unitId: unit.id })}
                  aria-label={`Rename ${unit.name}`}
                >
                  <Pencil /> Rename
                </Button>
                {/* The region root has no parent and is never deletable — the
                    single-root unique index depends on it existing. */}
                {!isRoot && (
                  <Button
                    size="xs"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Delete ${unit.name}? This cannot be undone.`)) return;
                      void send(`/api/org-units/${unit.id}`, { method: 'DELETE' });
                    }}
                    aria-label={`Delete ${unit.name}`}
                  >
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
            </div>

            {mode?.unitId === unit.id && mode.kind === 'add' && (
              <AddChildForm
                parent={unit}
                busy={busy}
                onCancel={() => setMode(null)}
                onSubmit={(body) =>
                  send(`/api/org-units/${unit.id}/children`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  })
                }
              />
            )}

            {mode?.unitId === unit.id && mode.kind === 'rename' && (
              <RenameForm
                unit={unit}
                busy={busy}
                onCancel={() => setMode(null)}
                onSubmit={(body) =>
                  send(`/api/org-units/${unit.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  })
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddChildForm({
  parent,
  busy,
  onCancel,
  onSubmit,
}: {
  parent: OrgUnit;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: {
    type: OrgUnitType;
    name: string;
    code: string;
    timezone: string;
  }) => Promise<boolean>;
}) {
  const [type, setType] = useState<OrgUnitType>(conventionalChildTier[parent.type] ?? 'club');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // Any tier strictly deeper than the parent is allowed; the API enforces the
  // same rule, so this only keeps the picker from offering a guaranteed 400.
  const allowed = orgUnitType.options.filter(
    (candidate) => orgUnitTierRank[candidate] > orgUnitTierRank[parent.type],
  );

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
      style={{ marginLeft: `${(parent.depth + 1) * 1.25}rem` }}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ type, name, code, timezone: parent.timezone });
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        Tier
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={type}
          onChange={(event) => setType(event.target.value as OrgUnitType)}
        >
          {allowed.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Code
        {/* Becomes an ltree label in the unit's path, so it must not contain dots or spaces. */}
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          pattern="[A-Za-z0-9_]+"
          title="Letters, digits and underscores only"
          required
        />
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        Create
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </form>
  );
}

function RenameForm({
  unit,
  busy,
  onCancel,
  onSubmit,
}: {
  unit: OrgUnit;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: { name: string; timezone: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState(unit.name);
  const [timezone, setTimezone] = useState(unit.timezone);

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
      style={{ marginLeft: `${unit.depth * 1.25}rem` }}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ name, timezone });
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Timezone
        <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Code and tier are fixed — the code is part of the unit&apos;s tree path.
      </p>
    </form>
  );
}
