'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Collapsible section, as on every tab of the legacy meeting page. */
export function Section({
  title,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 bg-muted/40 pr-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted"
        >
          <span className="text-sm font-semibold">{title}</span>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          )}
        </button>
        {action}
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Uppercase micro-heading used by the live-tool tabs. */
export function TabSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground/70">{hint}</p>}
      {action}
    </div>
  );
}
