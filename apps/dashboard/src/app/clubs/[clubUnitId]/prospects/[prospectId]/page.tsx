import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, MailIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react';

import { getProspect, getProspectVisits, getProspectCommunications } from '@/lib/membership';
import { listMeetings } from '@/lib/meetings';
import { Avatar } from '@/components/ui/avatar';
import { ProspectStatusBadge } from '@/components/prospects/ProspectStatusBadge';
import { ProspectDetailActions } from '@/components/prospects/ProspectDetailActions';
import { ProspectActivity } from '@/components/prospects/ProspectActivity';
import { LogActivity } from '@/components/prospects/LogActivity';
import { daysUntil, formatDate, isRedacted, whatsappLink } from '@/components/prospects/pipeline';

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; prospectId: string }>;
}) {
  const { clubUnitId, prospectId } = await params;
  const [prospect, visits, communications, meetings] = await Promise.all([
    getProspect(clubUnitId, prospectId),
    getProspectVisits(clubUnitId, prospectId),
    getProspectCommunications(clubUnitId, prospectId),
    listMeetings(clubUnitId),
  ]);
  if (!prospect) notFound();

  const redacted = isRedacted(prospect);
  const wa = whatsappLink(prospect.whatsapp ?? prospect.phone);
  const daysLeft = daysUntil(prospect.deleteAfter);
  const facts = [
    { label: 'Lead source', value: prospect.leadSource },
    { label: 'Curious about', value: prospect.preferredRole },
    { label: 'Added', value: formatDate(prospect.createdAt) },
  ].filter((f) => f.value);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-12 sm:px-6">
      <Link
        href={`/clubs/${clubUnitId}/prospects`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Prospects
      </Link>

      <header className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <Avatar name={prospect.fullName} photoUrl={prospect.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold break-words sm:text-2xl">
            {redacted ? 'Details removed' : prospect.fullName}
          </h1>
          <div className="mt-1.5">
            <ProspectStatusBadge status={prospect.pipelineStatus} />
          </div>
        </div>
      </header>

      {!redacted && (prospect.phone || wa || prospect.email) && (
        <div className="grid grid-cols-3 gap-2">
          {prospect.phone && (
            <a
              href={`tel:${prospect.phone}`}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-xs text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <PhoneIcon className="size-4" />
              Call
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-xs text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <MessageCircleIcon className="size-4" />
              WhatsApp
            </a>
          )}
          {prospect.email && (
            <a
              href={`mailto:${prospect.email}`}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-xs text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <MailIcon className="size-4" />
              Email
            </a>
          )}
        </div>
      )}

      <ProspectDetailActions clubUnitId={clubUnitId} prospect={prospect} />

      {(facts.length > 0 || prospect.bio) && (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          {facts.length > 0 && (
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted-foreground sm:text-xs">{fact.label}</dt>
                  <dd className="text-right font-medium sm:text-left">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {prospect.bio && (
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {prospect.bio}
            </p>
          )}
        </section>
      )}

      {/* The 180-day retention clock is a promise to the guest — surface it. */}
      {!redacted && prospect.pipelineStatus !== 'joined' && (
        <p className="text-xs text-muted-foreground">
          {daysLeft > 0
            ? `Contact details are deleted automatically in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${formatDate(prospect.deleteAfter)}) unless they join.`
            : 'Contact details are past their retention window and will be removed on the next nightly run.'}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Activity</h2>
          {!redacted && (
            <LogActivity clubUnitId={clubUnitId} prospectId={prospectId} meetings={meetings} />
          )}
        </div>
        <ProspectActivity visits={visits} communications={communications} meetings={meetings} />
      </section>
    </main>
  );
}
