'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { PathwayPath, PathwayProject } from '@toastmasters/contracts';
import { cn } from '@/lib/utils';

/**
 * Two searchable comboboxes for the Pathways catalogue:
 *
 * - `PathwayPathPicker` — choose one of the eleven paths, searchable by
 *   name, code (e.g. "PM"), or credential.
 * - `PathwayProjectPicker` — choose a project on a given path, grouped by
 *   level (L1 · L2 · L3 · L4 · L5), searchable by name or code, with a
 *   required/elective badge so a VPE can see what counts toward the level.
 *
 * Same portal-dropdown mechanic as MemberCombobox, so the picker escapes
 * `overflow-hidden` in the collapsible panels it sits inside and flips above
 * the trigger when it would otherwise open offscreen.
 */

function useDropdown(triggerRef: React.RefObject<HTMLButtonElement | null>) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 320 && rect.top > spaceBelow;
    setStyle({
      position: 'fixed',
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      left: rect.left,
      width: Math.max(rect.width, 260),
      zIndex: 60,
    });
  }, [triggerRef]);

  return { open, setOpen, style, computePosition };
}

function useDismiss(
  open: boolean,
  close: () => void,
  computePosition: () => void,
  rootRef: React.RefObject<HTMLDivElement | null>,
  dropRef: React.RefObject<HTMLDivElement | null>,
) {
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
  }, [open, close, computePosition, rootRef, dropRef]);
}

export function PathwayPathPicker({
  value,
  onChange,
  pathways,
  placeholder = 'Select path…',
  className,
  disabled = false,
}: {
  value: string;
  onChange: (pathCode: string) => void;
  pathways: PathwayPath[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { open, setOpen, style, computePosition } = useDropdown(triggerRef);

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, [setOpen]);

  useDismiss(open, close, computePosition, rootRef, dropRef);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return pathways;
    return pathways.filter(
      (p) =>
        p.pathCode.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.credential.toLowerCase().includes(query),
    );
  }, [pathways, query]);

  const selected = pathways.find((p) => p.pathCode === value) ?? null;

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
      style={style}
      className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search paths…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No match.</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.pathCode}
              type="button"
              onClick={() => {
                onChange(p.pathCode);
                close();
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                p.pathCode === value && 'bg-muted/60',
              )}
            >
              <Check
                className={cn(
                  'size-3.5 shrink-0 text-primary',
                  p.pathCode === value ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden
              />
              <span className="flex-1 truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.pathCode}</span>
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
          'flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm transition-colors disabled:opacity-50',
          open ? 'border-ring ring-1 ring-ring' : 'hover:bg-muted',
        )}
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected ? `${selected.name} (${selected.pathCode})` : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'ml-1 size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open && typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}

/**
 * A project picker for a given path. Projects are grouped by level; each row
 * shows a required/elective badge and the permitted duration bounds so the
 * VPE picks with the full picture. When the path has no projects seeded (or
 * an unknown path is passed), the picker disables itself with a helpful hint.
 */
export function PathwayProjectPicker({
  value,
  onChange,
  path,
  placeholder = 'Select project…',
  className,
  disabled = false,
}: {
  value: string;
  onChange: (project: PathwayProject) => void;
  path: PathwayPath | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { open, setOpen, style, computePosition } = useDropdown(triggerRef);

  const close = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, [setOpen]);

  useDismiss(open, close, computePosition, rootRef, dropRef);

  const projects = useMemo(() => path?.projects ?? [], [path]);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return projects;
    return projects.filter(
      (p) => p.projectCode.toLowerCase().includes(query) || p.name.toLowerCase().includes(query),
    );
  }, [projects, query]);

  const groupedByLevel = useMemo(() => {
    const map = new Map<number, PathwayProject[]>();
    for (const p of filtered) {
      const bucket = map.get(p.level) ?? [];
      bucket.push(p);
      map.set(p.level, bucket);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const selected = projects.find((p) => p.projectCode === value) ?? null;
  const effectiveDisabled = disabled || projects.length === 0;

  function toggle() {
    if (effectiveDisabled) return;
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
      style={style}
      className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No match.</p>
        ) : (
          groupedByLevel.map(([level, items]) => (
            <div key={level}>
              <div className="sticky top-0 bg-popover px-3 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Level {level}
              </div>
              {items.map((p) => (
                <button
                  key={p.projectCode}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    close();
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                    p.projectCode === value && 'bg-muted/60',
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 size-3.5 shrink-0 text-primary',
                      p.projectCode === value ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                          p.isRequired
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {p.isRequired ? 'Required' : 'Elective'}
                      </span>
                      <span>
                        {p.minMinutes === p.maxMinutes
                          ? `${p.minMinutes} min`
                          : `${p.minMinutes}–${p.maxMinutes} min`}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({
      projectCode: '',
      name: '',
      level: 0,
      minMinutes: 0,
      maxMinutes: 0,
      isRequired: false,
    });
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={effectiveDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm transition-colors disabled:opacity-50',
          open ? 'border-ring ring-1 ring-ring' : 'hover:bg-muted',
        )}
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected ? `L${selected.level} · ${selected.name}` : placeholder}
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-1">
          {value && !effectiveDisabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={clear}
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
