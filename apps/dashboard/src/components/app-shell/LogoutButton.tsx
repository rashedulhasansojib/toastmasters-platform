'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

/** Clears the session cookie, then hard-navigates to /login so no signed-in server-rendered page stays in the router cache. */
export function LogoutButton({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch('/api/session/logout', { method: 'POST' });
      onNavigate?.();
      router.replace('/login');
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-60"
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      <span>{pending ? 'Logging out…' : 'Log out'}</span>
    </button>
  );
}
