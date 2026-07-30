import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';

import { getMembershipRoster, getMemberSpeechHistory } from '@/lib/membership';
import { Avatar } from '@/components/ui/avatar';
import { HealthBandBadge } from '@/components/membership/HealthBandBadge';
import { SpeechHistoryList } from '@/components/membership/SpeechHistoryList';
import { MEMBER_TYPE_LABEL, formatDate } from '@/components/membership/bands';

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): a member's speech-history
 * drill-down, reached by clicking their card on the VP Membership
 * dashboard. Fetches the whole roster and finds this entry rather than
 * adding a single-member endpoint — one club's roster is small, and this
 * matches `getMembershipRoster`'s existing shape.
 */
export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; personId: string }>;
}) {
  const { clubUnitId, personId } = await params;
  const [roster, speeches] = await Promise.all([
    getMembershipRoster(clubUnitId),
    getMemberSpeechHistory(clubUnitId, personId),
  ]);
  const member = roster.find((m) => m.personId === personId);
  if (!member) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-12 sm:px-6">
      <Link
        href={`/clubs/${clubUnitId}/membership`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Membership
      </Link>

      <header className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <Avatar name={member.fullName} photoUrl={member.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold wrap-break-word sm:text-2xl">{member.fullName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {member.healthSignal && <HealthBandBadge band={member.healthSignal.band} />}
            <span className="text-sm text-muted-foreground">
              {MEMBER_TYPE_LABEL[member.memberType]} · joined {formatDate(member.joinedAt)}
            </span>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {member.email && (
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground sm:text-xs">Email</dt>
              <dd className="text-right font-medium sm:text-left">{member.email}</dd>
            </div>
          )}
          {member.phone && (
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground sm:text-xs">Phone</dt>
              <dd className="text-right font-medium sm:text-left">{member.phone}</dd>
            </div>
          )}
        </dl>
        {member.healthSignal && member.healthSignal.reasons.length > 0 && (
          <p className="text-muted-foreground">{member.healthSignal.reasons.join(' · ')}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Prepared speech history</h2>
        <SpeechHistoryList speeches={speeches} />
      </section>
    </main>
  );
}
