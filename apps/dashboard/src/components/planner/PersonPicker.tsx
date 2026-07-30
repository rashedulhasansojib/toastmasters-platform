'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import type { ClubMemberSummary, Guest } from '@toastmasters/contracts';

import { cn } from '@/lib/utils';

export type PickerSelection =
  | { kind: 'member'; personId: string; fullName: string }
  | { kind: 'guest'; guestId: string; fullName: string };

type PersonPickerProps = {
  /** Currently selected assignee (member or guest), or null when the slot is empty. */
  value: PickerSelection | null;
  /** Called with the new selection, or null when the user clears the slot. */
  onChange: (next: PickerSelection | null) => void;
  members: ClubMemberSummary[];
  guests: Guest[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * The planner's per-cell picker. A searchable dropdown that surfaces the
 * two pools a club actually picks role-holders from — active members and
 * current guests. Ported from `toastmaster-portal`'s MemberCombobox but
 * adapted to the new portal's identity model: an id-and-kind rather than a
 * free-text name, because §9.2 rules out name-string assignments.
 */
export function PersonPicker({
  value,
  onChange,
  members,
  guests,
  placeholder = 'Assign…',
  disabled,
  className,
}: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeMembers = useMemo(() => members.filter((m) => m.localStatus === 'active'), [members]);

  const q = search.trim().toLowerCase();
  const matchedMembers = useMemo(
    () => (q ? activeMembers.filter((m) => m.fullName.toLowerCase().includes(q)) : activeMembers),
    [activeMembers, q],
  );
  const matchedGuests = useMemo(
    () => (q ? guests.filter((g) => g.fullName.toLowerCase().includes(q)) : guests),
    [guests, q],
  );

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 240),
      zIndex: 9999,
    });
  }, []);

  function openDropdown() {
    if (disabled) return;
    computePosition();
    setOpen(true);
    setSearch('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  function pickMember(m: ClubMemberSummary) {
    onChange({ kind: 'member', personId: m.personId, fullName: m.fullName });
    closeDropdown();
  }

  function pickGuest(g: Guest) {
    onChange({ kind: 'guest', guestId: g.id, fullName: g.fullName });
    closeDropdown();
  }

  function clearSelection(event: React.MouseEvent) {
    event.stopPropagation();
    onChange(null);
  }

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.parentElement?.contains(target)) return;
      const dropdown = document.getElementById('planner-person-picker-portal');
      if (!dropdown?.contains(target)) closeDropdown();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDropdown();
    };
    const onScroll = () => computePosition();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, closeDropdown, computePosition]);

  const activeKey =
    value?.kind === 'member'
      ? `m:${value.personId}`
      : value?.kind === 'guest'
        ? `g:${value.guestId}`
        : null;

  const dropdown = (
    <div
      id="planner-person-picker-portal"
      style={dropdownStyle}
      className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members or guests…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="max-h-64 overflow-y-auto py-1">
        {matchedMembers.length === 0 && matchedGuests.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No match</p>
        ) : (
          <>
            {matchedMembers.length > 0 && (
              <>
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Members
                </p>
                {matchedMembers.map((m) => {
                  const isActive = activeKey === `m:${m.personId}`;
                  return (
                    <button
                      key={m.personId}
                      type="button"
                      onClick={() => pickMember(m)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        isActive && 'bg-accent/60',
                      )}
                    >
                      <CheckIcon
                        className={cn(
                          'size-3.5 shrink-0 text-primary',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex-1 truncate font-medium">{m.fullName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.memberType.replace(/_/g, ' ')}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {matchedGuests.length > 0 && (
              <>
                {matchedMembers.length > 0 && <div className="my-1 border-t border-border" />}
                <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Guests
                </p>
                {matchedGuests.map((g) => {
                  const isActive = activeKey === `g:${g.id}`;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => pickGuest(g)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                        isActive && 'bg-accent/60',
                      )}
                    >
                      <CheckIcon
                        className={cn(
                          'size-3.5 shrink-0 text-primary',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex-1 truncate font-medium">{g.fullName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">Guest</span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeDropdown() : openDropdown())}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-2.5 text-left text-sm transition-colors',
          open ? 'ring-1 ring-ring' : 'hover:bg-accent',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          className={cn('flex-1 truncate', value ? 'text-foreground' : 'text-muted-foreground')}
        >
          {value?.fullName ?? placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={clearSelection}
              aria-label="Clear"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3" />
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              'size-3.5 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
