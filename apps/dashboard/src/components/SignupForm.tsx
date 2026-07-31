'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch('/api/session/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password }),
          }),
        {
          loading: 'Creating your sandbox…',
          success: 'Welcome to the sandbox',
          error: 'Could not create your account.',
        },
      );
      if (!result) return;
      router.push('/');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label
          htmlFor="fullName"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Full name
        </Label>
        <div className="relative">
          <User className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            autoFocus
            placeholder="Jordan Rivera"
            className="h-11 rounded-xl pl-10.5 focus-visible:border-[#772432] focus-visible:ring-[#772432]/20"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Email
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="h-11 rounded-xl pl-10.5 focus-visible:border-[#772432] focus-visible:ring-[#772432]/20"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="password"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Password
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="h-11 rounded-xl pr-11 pl-10.5 focus-visible:border-[#772432] focus-visible:ring-[#772432]/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full rounded-xl bg-[#772432] text-base font-medium text-white hover:bg-[#5c1c27]"
      >
        {submitting ? 'Creating your sandbox…' : 'Start the demo'}
      </Button>
    </form>
  );
}
