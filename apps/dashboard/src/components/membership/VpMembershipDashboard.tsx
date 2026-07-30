'use client';

import { useMemo, useState } from 'react';
import type { MembershipRosterEntry } from '@toastmasters/contracts';
import { SearchIcon, UsersIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { MemberCard } from './MemberCard';

function matches(needle: string, haystack: Array<string | null | undefined>): boolean {
  return haystack
    .filter((v): v is string => Boolean(v))
    .some((v) => v.toLowerCase().includes(needle));
}

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the VP Membership dashboard.
 * Guests have their own pipeline board (`/clubs/:id/guests`) — a converted
 * guest already shows up here via `getMembershipRoster()`, so this page is
 * members only, not a second place to see the same pipeline.
 */
export function VpMembershipDashboard({
  clubUnitId,
  members,
}: {
  clubUnitId: string;
  members: MembershipRosterEntry[];
}) {
  const [query, setQuery] = useState('');

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) => matches(needle, [m.fullName, m.email, m.phone]));
  }, [members, query]);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Membership</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {members.length} member{members.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search members by name, email, or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 pl-9 lg:h-9"
          aria-label="Search members"
        />
      </div>

      {visibleMembers.length === 0 ? (
        <EmptyState hasAny={members.length > 0} filtered={query.trim() !== ''} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visibleMembers.map((member) => (
            <MemberCard key={member.personId} clubUnitId={clubUnitId} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasAny, filtered }: { hasAny: boolean; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <UsersIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        {hasAny && filtered ? 'Nothing matches that search.' : 'No members yet'}
      </p>
    </div>
  );
}
