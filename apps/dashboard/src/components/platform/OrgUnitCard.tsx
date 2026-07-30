'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { conventionalChildTier, type OrgUnitWithCount } from '@toastmasters/contracts';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeOrgUnitFailure } from '@/lib/org-unit-errors';
import { submitAction } from '@/lib/toast';

/** "N members" for a club (a leaf — `childCount` is its active member count); "N districts"/"N divisions"/… everywhere else. */
function countLabel(unit: OrgUnitWithCount): string {
  const n = unit.childCount;
  const noun = unit.type === 'club' ? 'member' : (conventionalChildTier[unit.type] ?? 'unit');
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function OrgUnitCard({
  regionUnitId,
  unit,
}: {
  regionUnitId: string;
  unit: OrgUnitWithCount;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // The region root has no parent and is never deletable — the
  // single-root unique index depends on it existing.
  const isRoot = unit.parentId === null;
  const isLeaf = unit.type === 'club';

  async function handleDelete(): Promise<void> {
    if (!confirm(`Delete ${unit.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const result = await submitAction(
        async () => {
          const response = await fetch(`/api/org-units/${unit.id}`, { method: 'DELETE' });
          if (!response.ok) throw new Error(await describeOrgUnitFailure(response));
          return response;
        },
        {
          loading: 'Deleting org unit…',
          success: 'Org unit deleted',
          error: `Could not delete ${unit.name}.`,
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <CardContent className="flex flex-1 flex-col gap-1 pr-8">
      <span className="truncate font-medium">{unit.name}</span>
      <span className="text-sm text-muted-foreground">
        {unit.code} · {countLabel(unit)}
      </span>
    </CardContent>
  );

  return (
    <Card className="relative">
      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${unit.name}`}
            disabled={busy}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {!isRoot && (
              <DropdownMenuItem variant="destructive" onClick={() => void handleDelete()}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLeaf ? (
        content
      ) : (
        <Link href={`/platform/${regionUnitId}/org-tree/${unit.id}`}>{content}</Link>
      )}

      <RenameDialog unit={unit} open={renameOpen} onOpenChange={setRenameOpen} />
    </Card>
  );
}

function RenameDialog({
  unit,
  open,
  onOpenChange,
}: {
  unit: OrgUnitWithCount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${unit.name}`}>
      {open && (
        <RenameForm
          key={unit.id}
          unit={unit}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function RenameForm({
  unit,
  onDone,
  onCancel,
}: {
  unit: OrgUnitWithCount;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(unit.name);
  const [timezone, setTimezone] = useState(unit.timezone);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        async () => {
          const response = await fetch(`/api/org-units/${unit.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, timezone }),
          });
          if (!response.ok) throw new Error(await describeOrgUnitFailure(response));
          return response;
        },
        {
          loading: 'Saving changes…',
          success: 'Changes saved',
          error: `Could not update ${unit.name}.`,
        },
      );
      if (!result) return;
      onDone();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="unit-name">Name</Label>
        <Input
          id="unit-name"
          className="h-11 lg:h-9"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="unit-timezone">Timezone</Label>
        <Input
          id="unit-timezone"
          className="h-11 lg:h-9"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Code and tier are fixed — the code is part of the unit&apos;s tree path.
      </p>
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
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
