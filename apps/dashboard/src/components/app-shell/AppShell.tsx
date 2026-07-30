'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import type { SessionResponse, SwitchableUnit } from '@toastmasters/contracts';
import { UnitSwitcher } from '@/components/UnitSwitcher';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';

/**
 * The signed-in shell: a persistent sidebar on `lg` and up, a slide-in
 * drawer below that, and a top bar at every width carrying the unit switcher.
 * Rendered from the root layout only when a session exists; the login and
 * guest pages fall through to their own layouts.
 */
export function AppShell({
  session,
  units,
  children,
}: {
  session: SessionResponse;
  units: SwitchableUnit[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const close = useCallback(() => setOpen(false), []);

  // Route changed underneath us (back/forward, redirect) — collapse the drawer.
  // Setting state during render is the idiomatic React 19 pattern for
  // deriving state from a prop change without the cascading-renders warning
  // that a useEffect + setState pair triggers.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-sidebar-border lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar session={session} />
        </div>
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={close}
        aria-hidden={!open}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar shadow-lg transition-transform lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!open}
      >
        <Sidebar session={session} onNavigate={close} />
      </aside>

      {/* On `lg` the content column owns its own scroll, so the top bar stays
          put and a page's own sticky header (the meeting workspace) sticks
          under it instead of on top of it. Below `lg` the page scrolls
          normally — mobile browser chrome and the drawer's scroll lock both
          depend on that. */}
      <div className="flex min-w-0 flex-col lg:h-screen lg:overflow-hidden">
        <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="rounded-md border border-border p-1.5 text-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold text-[var(--brand)] lg:hidden">Toastmasters</span>
          <div className="ml-auto">
            <UnitSwitcher units={units} activeUnit={session.activeUnit} />
          </div>
        </header>
        <main className="min-w-0 flex-1 lg:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
