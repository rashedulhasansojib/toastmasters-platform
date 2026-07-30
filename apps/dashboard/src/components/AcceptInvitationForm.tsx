'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function AcceptInvitationForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, password }),
          }),
        {
          loading: 'Setting up your account…',
          success: 'Account created',
          error: 'That invitation link is invalid, expired, or already used.',
        },
      );
      if (!result) return;
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account is ready — taking you to the login page…
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
      <div className="rounded-xl border border-[#EBD9C8] bg-[#FAF3EC] px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Signing in as
        </p>
        <p className="mt-1 break-all text-sm font-medium text-[#2A1418]">{email}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="accept-full-name">Full name</Label>
        <Input
          id="accept-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          autoFocus
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="accept-password">Choose a password</Label>
        <Input
          id="accept-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-11 rounded-xl"
        />
      </div>
      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-xl text-base font-medium"
      >
        {submitting ? 'Setting up your account…' : 'Create account'}
      </Button>
    </form>
  );
}
