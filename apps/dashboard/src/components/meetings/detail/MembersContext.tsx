'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ClubMemberSummary } from '@toastmasters/contracts';

/**
 * The club roster, fetched once on the server and shared by every member
 * picker on the meeting page. Without this each picker would fetch the same
 * list, which on a phone at a venue is exactly the wrong trade.
 */
const MembersContext = createContext<ClubMemberSummary[]>([]);

export function MembersProvider({
  members,
  children,
}: {
  members: ClubMemberSummary[];
  children: ReactNode;
}) {
  return <MembersContext.Provider value={members}>{children}</MembersContext.Provider>;
}

export function useClubMembers(): ClubMemberSummary[] {
  return useContext(MembersContext);
}

/** Resolve a person id to a display name, falling back to a short id for someone who has since left the club. */
export function useMemberName(): (personId: string | null | undefined) => string {
  const members = useClubMembers();
  return (personId) => {
    if (!personId) return 'Unfilled';
    return (
      members.find((m) => m.personId === personId)?.fullName ??
      `Former member (${personId.slice(0, 8)})`
    );
  };
}
