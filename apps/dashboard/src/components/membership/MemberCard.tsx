import Link from 'next/link';
import type { MembershipRosterEntry } from '@toastmasters/contracts';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { HealthBandBadge } from './HealthBandBadge';
import { MEMBER_TYPE_LABEL } from './bands';

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the member-health signal v1's
 * card — mirrors GuestCard's identity block, but the whole card is a link
 * (no secondary interactive zone; the health band is a fact, not an
 * action). The roster always resolves a band — either the nightly job's
 * persisted signal, or a live fallback computed the same way for a
 * membership it hasn't reached yet — so `null` here only happens if the
 * caller isn't VPM-scoped (`membership.health_signal` is restricted).
 */
export function MemberCard({
  clubUnitId,
  member,
}: {
  clubUnitId: string;
  member: MembershipRosterEntry;
}) {
  const reason = member.healthSignal?.reasons[0] ?? null;

  return (
    <Link
      href={`/clubs/${clubUnitId}/membership/${member.personId}`}
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-all',
        'hover:border-foreground/15 hover:shadow-sm',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <Avatar name={member.fullName} photoUrl={member.photoUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium">{member.fullName}</p>
          {member.healthSignal ? (
            <HealthBandBadge band={member.healthSignal.band} className="mt-0.5 shrink-0" />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {reason ?? MEMBER_TYPE_LABEL[member.memberType]}
        </p>
      </div>
    </Link>
  );
}
