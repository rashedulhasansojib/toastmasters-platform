'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import type { SessionResponse } from '@toastmasters/contracts';
import { cn } from '@/lib/utils';
import { LogoutButton } from './LogoutButton';
import { buildNavSections } from './nav-config';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  session,
  onNavigate,
}: {
  session: SessionResponse;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = buildNavSections(session.activeUnit);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
        <Link href="/" onClick={onNavigate} className="text-sm font-semibold text-[var(--brand)]">
          Toastmasters
        </Link>
        {onNavigate && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onNavigate}
            className="rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-2 pb-1 text-xs font-medium tracking-wide text-sidebar-foreground/50 uppercase">
              {section.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const ActionIcon = item.action?.icon;
                return (
                  <li key={item.href} className="flex items-center gap-1">
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                    {item.action && ActionIcon && (
                      <Link
                        href={item.action.href}
                        onClick={onNavigate}
                        aria-label={item.action.label}
                        title={item.action.label}
                        className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        <ActionIcon className="size-4" aria-hidden />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-2 py-3">
        <div className="truncate px-2 pb-1 text-sm font-medium" title={session.fullName}>
          {session.fullName}
        </div>
        <LogoutButton onNavigate={onNavigate} />
      </div>
    </div>
  );
}
