'use client';

import { useMemo, useState } from 'react';
import type { Guest, MembershipRosterEntry } from '@toastmasters/contracts';
import { SearchIcon, UsersIcon, UserPlusIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GuestCard } from '@/components/guests/GuestCard';
import { MoveGuestDialog } from '@/components/guests/MoveGuestDialog';
import { useGuestActions } from '@/components/guests/useGuestActions';
import { MemberCard } from './MemberCard';

function matches(needle: string, haystack: Array<string | null | undefined>): boolean {
  return haystack
    .filter((v): v is string => Boolean(v))
    .some((v) => v.toLowerCase().includes(needle));
}

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the VP Membership dashboard.
 * Members left / guests right on a laptop; the same two datasets behind a
 * Members/Guests tab switch on a phone, where a side-by-side grid would
 * squeeze both lists unusably narrow. One search box filters both panels
 * by name/email/phone at once — the datasets are small (one club's roster
 * and pipeline), so this stays client-side rather than a new endpoint.
 */
export function VpMembershipDashboard({
  clubUnitId,
  members,
  guests,
}: {
  clubUnitId: string;
  members: MembershipRosterEntry[];
  guests: Guest[];
}) {
  const [query, setQuery] = useState('');
  const [moveTarget, setMoveTarget] = useState<Guest | null>(null);
  const { moveTo, pendingId } = useGuestActions(clubUnitId);

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) => matches(needle, [m.fullName, m.email, m.phone]));
  }, [members, query]);

  const visibleGuests = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter((g) => matches(needle, [g.fullName, g.email, g.phone]));
  }, [guests, query]);

  const memberPanel =
    visibleMembers.length === 0 ? (
      <EmptyState
        icon={UsersIcon}
        hasAny={members.length > 0}
        filtered={query.trim() !== ''}
        emptyLabel="No members yet"
      />
    ) : (
      <div className="flex flex-col gap-2.5">
        {visibleMembers.map((member) => (
          <MemberCard key={member.personId} clubUnitId={clubUnitId} member={member} />
        ))}
      </div>
    );

  const guestPanel =
    visibleGuests.length === 0 ? (
      <EmptyState
        icon={UserPlusIcon}
        hasAny={guests.length > 0}
        filtered={query.trim() !== ''}
        emptyLabel="Nobody in the pipeline yet"
      />
    ) : (
      <div className="flex flex-col gap-2.5">
        {visibleGuests.map((g) => (
          <GuestCard
            key={g.id}
            clubUnitId={clubUnitId}
            guest={g}
            onRequestMove={setMoveTarget}
            pending={pendingId === g.id}
          />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Membership</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {members.length} member{members.length === 1 ? '' : 's'} · {guests.length} in the guest
          pipeline
        </p>
      </header>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search members and guests by name, email, or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 pl-9 lg:h-9"
          aria-label="Search members and guests"
        />
      </div>

      {/* lg and up: a static two-column layout. Below that: a Members/Guests
          tab switch — a side-by-side grid there would squeeze both lists
          into a column too narrow to read a card. */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Members · {visibleMembers.length}
          </h2>
          {memberPanel}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Guests · {visibleGuests.length}
          </h2>
          {guestPanel}
        </section>
      </div>

      <Tabs defaultValue="members" className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="members">Members · {visibleMembers.length}</TabsTrigger>
          <TabsTrigger value="guests">Guests · {visibleGuests.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="members">{memberPanel}</TabsContent>
        <TabsContent value="guests">{guestPanel}</TabsContent>
      </Tabs>

      <MoveGuestDialog
        guest={moveTarget}
        open={moveTarget !== null}
        onOpenChange={(open) => !open && setMoveTarget(null)}
        onMove={moveTo}
        pending={pendingId !== null}
      />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  hasAny,
  filtered,
  emptyLabel,
}: {
  icon: typeof UsersIcon;
  hasAny: boolean;
  filtered: boolean;
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        {hasAny && filtered ? 'Nothing matches that search.' : emptyLabel}
      </p>
    </div>
  );
}
