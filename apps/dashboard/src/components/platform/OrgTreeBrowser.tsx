'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  conventionalChildTier,
  type OrgUnit,
  type OrgUnitWithCount,
} from '@toastmasters/contracts';

import { Button } from '@/components/ui/button';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeOrgUnitFailure } from '@/lib/org-unit-errors';
import { OrgUnitCard } from './OrgUnitCard';

export function OrgTreeBrowser({
  regionUnitId,
  ancestors,
  childUnits,
}: {
  regionUnitId: string;
  ancestors: OrgUnit[];
  childUnits: OrgUnitWithCount[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const currentParent = ancestors[ancestors.length - 1];
  const isRoot = currentParent === undefined;

  const childTier = isRoot ? 'region' : conventionalChildTier[currentParent.type];

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'All Regions', href: `/platform/${regionUnitId}/org-tree` },
    ...ancestors.map((a) => ({
      label: a.name,
      href: `/platform/${regionUnitId}/org-tree/${a.id}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb items={breadcrumbItems} />
        {childTier && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Add new {childTier}
          </Button>
        )}
      </div>

      {childUnits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {childUnits.map((unit) => (
            <OrgUnitCard key={unit.id} regionUnitId={regionUnitId} unit={unit} />
          ))}
        </div>
      )}

      {childTier && (
        <AddDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          regionUnitId={regionUnitId}
          childTier={childTier}
          parentId={isRoot ? undefined : currentParent.id}
          defaultTimezone={isRoot ? undefined : currentParent.timezone}
        />
      )}
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  regionUnitId,
  childTier,
  parentId,
  defaultTimezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regionUnitId: string;
  childTier: string;
  /** Absent when adding a region root — see `parentId ? … : …` below. */
  parentId?: string;
  defaultTimezone?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Add new ${childTier}`}>
      {open && (
        <AddForm
          key={parentId ?? 'root'}
          regionUnitId={regionUnitId}
          childTier={childTier}
          parentId={parentId}
          defaultTimezone={defaultTimezone}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function AddForm({
  regionUnitId,
  childTier,
  parentId,
  defaultTimezone,
  onDone,
  onCancel,
}: {
  regionUnitId: string;
  childTier: string;
  parentId?: string;
  defaultTimezone?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [timezone, setTimezone] = useState(defaultTimezone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        parentId
          ? `/api/org-units/${parentId}/children`
          : `/api/platform/${regionUnitId}/org-tree/regions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            parentId ? { type: childTier, name, code, timezone } : { name, code, timezone },
          ),
        },
      );
      if (!response.ok) {
        setError(await describeOrgUnitFailure(response));
        return;
      }
      onDone();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-unit-name">Name</Label>
        <Input
          id="new-unit-name"
          className="h-11 lg:h-9"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-unit-code">Code</Label>
        {/* Becomes an ltree label in the unit's path, so it must not contain dots or spaces. */}
        <Input
          id="new-unit-code"
          className="h-11 lg:h-9"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          pattern="[A-Za-z0-9_]+"
          title="Letters, digits and underscores only"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-unit-timezone">Timezone</Label>
        <Input
          id="new-unit-timezone"
          className="h-11 lg:h-9"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 lg:h-9"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" className="h-11 lg:h-9" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
