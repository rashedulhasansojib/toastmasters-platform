'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function AddGuestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [invitedBy, setInvitedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch('/api/sandbox/guests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName,
              email: email || null,
              invitedBy: invitedBy || null,
            }),
          }),
        { loading: 'Adding guest…', success: 'Guest added', error: 'Could not add guest' },
      );
      if (!result) return;
      setFullName('');
      setEmail('');
      setInvitedBy('');
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add guest
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-name">Full name</Label>
        <Input
          id="guest-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-email">Email</Label>
        <Input
          id="guest-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-invited-by">Invited by</Label>
        <Input
          id="guest-invited-by"
          value={invitedBy}
          onChange={(e) => setInvitedBy(e.target.value)}
          className="w-48"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
