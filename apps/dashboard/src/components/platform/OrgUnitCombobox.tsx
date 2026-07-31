'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OrgUnitComboboxItem = { id: string; name: string; code: string };

/**
 * Single-select searchable dropdown over an already-fetched list of org
 * units, one tier at a time (all districts, all divisions, ...). Same
 * portal-dropdown mechanic as MemberCombobox — copied rather than shared
 * because that one is keyed to the meeting roster context, not a generic
 * item list.
 */
export function OrgUnitCombobox({
  items,
  value,
  onChange,
  placeholder = 'Select…',
  emptyMessage = 'No options.',
  disabled = false,
  className,
}: {
  items: OrgUnitComboboxItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === value) ?? null;
  const query = search.trim().toLowerCase();
  const filtered = query
    ? items.filter(
        (i) => i.name.toLowerCase().includes(query) || i.code.toLowerCase().includes(query),
      )
    : items;

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 280 && rect.top > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      left: rect.left,
      width: Math.max(rect.width, 220),
      zIndex: 60,
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !dropRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onReflow = () => computePosition();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open, close, computePosition]);

  function toggle() {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    computePosition();
    setOpen(true);
    setSearch('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const dropdown = (
    <div
      ref={dropRef}
      style={dropdownStyle}
      className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {items.length === 0 ? emptyMessage : 'No match.'}
          </p>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id);
                close();
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                item.id === value && 'bg-muted/60',
              )}
            >
              <Check
                className={cn(
                  'size-3.5 shrink-0 text-primary',
                  item.id === value ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden
              />
              <span className="flex-1 truncate font-medium">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.code}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm transition-colors lg:h-9 disabled:opacity-50',
          open ? 'border-ring ring-1 ring-ring' : 'hover:bg-muted',
        )}
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected?.name ?? placeholder}
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-1">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" aria-hidden />
            </span>
          )}
          <ChevronDown
            className={cn(
              'size-3.5 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
