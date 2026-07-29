'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Prospect } from '@toastmasters/contracts';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Fields = {
  fullName: string;
  email: string;
  phone: string;
  whatsapp: string;
  leadSource: string;
  preferredRole: string;
  bio: string;
};

const EMPTY: Fields = {
  fullName: '',
  email: '',
  phone: '',
  whatsapp: '',
  leadSource: '',
  preferredRole: '',
  bio: '',
};

function fieldsOf(prospect: Prospect): Fields {
  return {
    fullName: prospect.fullName,
    email: prospect.email ?? '',
    phone: prospect.phone ?? '',
    whatsapp: prospect.whatsapp ?? '',
    leadSource: prospect.leadSource ?? '',
    preferredRole: prospect.preferredRole ?? '',
    bio: prospect.bio ?? '',
  };
}

/** `.min(1)` on every optional means an empty string is a 400 — send nothing instead. */
function orUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function ProspectFormDialog({
  clubUnitId,
  prospect,
  open,
  onOpenChange,
}: {
  clubUnitId: string;
  /** Present for edit, absent for create. */
  prospect?: Prospect;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const editing = prospect !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit prospect' : 'Add prospect'}
      description={
        editing ? undefined : 'Only a name is required — the rest can follow after the visit.'
      }
    >
      {/* Mounted only while open, and keyed by target, so each opening starts
          from fresh state — no effect syncing props into state. */}
      {open && (
        <ProspectForm
          key={prospect?.id ?? 'new'}
          clubUnitId={clubUnitId}
          prospect={prospect}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function ProspectForm({
  clubUnitId,
  prospect,
  onDone,
  onCancel,
}: {
  clubUnitId: string;
  prospect?: Prospect;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const editing = prospect !== undefined;
  const [fields, setFields] = useState<Fields>(() => (prospect ? fieldsOf(prospect) : EMPTY));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof Fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    // `updateProspectRequestSchema` is strict and has no `fullName` — sending
    // one on edit is a 422, so the name is create-time only.
    const payload = {
      ...(editing ? {} : { fullName: fields.fullName.trim() }),
      email: orUndefined(fields.email),
      phone: orUndefined(fields.phone),
      whatsapp: orUndefined(fields.whatsapp),
      leadSource: orUndefined(fields.leadSource),
      preferredRole: orUndefined(fields.preferredRole),
      bio: orUndefined(fields.bio),
    };

    try {
      const response = await fetch(
        editing
          ? `/api/clubs/${clubUnitId}/prospects/${prospect.id}`
          : `/api/clubs/${clubUnitId}/prospects`,
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        setError(editing ? 'Could not save those changes.' : 'Could not add that prospect.');
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError('Network error — nothing was saved.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prospect-full-name">Full name</Label>
        <Input
          id="prospect-full-name"
          className="h-11 sm:h-9"
          value={fields.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          disabled={editing}
          required={!editing}
          autoComplete="name"
        />
        {editing && (
          <p className="text-xs text-muted-foreground">
            A prospect&apos;s name can&apos;t be changed after they&apos;re added.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prospect-phone">Phone</Label>
          <Input
            id="prospect-phone"
            type="tel"
            inputMode="tel"
            className="h-11 sm:h-9"
            value={fields.phone}
            onChange={(e) => set('phone', e.target.value)}
            autoComplete="tel"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prospect-whatsapp">WhatsApp</Label>
          <Input
            id="prospect-whatsapp"
            type="tel"
            inputMode="tel"
            className="h-11 sm:h-9"
            placeholder="Same as phone if blank"
            value={fields.whatsapp}
            onChange={(e) => set('whatsapp', e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prospect-email">Email</Label>
        <Input
          id="prospect-email"
          type="email"
          inputMode="email"
          className="h-11 sm:h-9"
          value={fields.email}
          onChange={(e) => set('email', e.target.value)}
          autoComplete="email"
        />
        <p className="text-xs text-muted-foreground">Needed later to convert them to a member.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prospect-lead-source">Lead source</Label>
          <Input
            id="prospect-lead-source"
            className="h-11 sm:h-9"
            placeholder="e.g. Facebook post"
            value={fields.leadSource}
            onChange={(e) => set('leadSource', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prospect-preferred-role">Role they&apos;re curious about</Label>
          <Input
            id="prospect-preferred-role"
            className="h-11 sm:h-9"
            placeholder="e.g. Timer"
            value={fields.preferredRole}
            onChange={(e) => set('preferredRole', e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prospect-bio">Notes</Label>
        <Textarea
          id="prospect-bio"
          rows={3}
          value={fields.bio}
          onChange={(e) => set('bio', e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 sm:h-9"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" className="h-11 sm:h-9" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Add prospect'}
        </Button>
      </div>
    </form>
  );
}
