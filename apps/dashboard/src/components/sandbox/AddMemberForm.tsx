'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

const PATHWAYS = [
  'Dynamic Leadership',
  'Motivational Strategies',
  'Engaging Humor',
  'Presentation Mastery',
  'Persuasive Influence',
];

export function AddMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Member');
  const [email, setEmail] = useState('');
  const [pathway, setPathway] = useState(PATHWAYS[0]);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch('/api/sandbox/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, role, email, pathway }),
          }),
        { loading: 'Adding member…', success: 'Member added', error: 'Could not add member' },
      );
      if (!result) return;
      setFullName('');
      setEmail('');
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add member
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="member-name">Full name</Label>
        <Input
          id="member-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="member-role">Role</Label>
        <Input
          id="member-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="member-email">Email</Label>
        <Input
          id="member-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-56"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="member-pathway">Pathway</Label>
        <select
          id="member-pathway"
          value={pathway}
          onChange={(e) => setPathway(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {PATHWAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
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
