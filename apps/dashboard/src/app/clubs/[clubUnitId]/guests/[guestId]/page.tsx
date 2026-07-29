import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, MailIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react';

import { getGuest, getGuestVisits, getGuestCommunications } from '@/lib/membership';
import { listMeetings } from '@/lib/meetings';
import { Avatar } from '@/components/ui/avatar';
import { GuestStatusBadge } from '@/components/guests/GuestStatusBadge';
import { GuestDetailActions } from '@/components/guests/GuestDetailActions';
import { GuestActivity } from '@/components/guests/GuestActivity';
import { LogActivity } from '@/components/guests/LogActivity';
import { daysUntil, formatDate, isRedacted, whatsappLink } from '@/components/guests/pipeline';

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; guestId: string }>;
}) {
  const { clubUnitId, guestId } = await params;
  const [guest, visits, communications, meetings] = await Promise.all([
    getGuest(clubUnitId, guestId),
    getGuestVisits(clubUnitId, guestId),
    getGuestCommunications(clubUnitId, guestId),
    listMeetings(clubUnitId),
  ]);
  if (!guest) notFound();

  const redacted = isRedacted(guest);
  const wa = whatsappLink(guest.whatsapp ?? guest.phone);
  const daysLeft = daysUntil(guest.deleteAfter);
  const facts = [
    { label: 'Lead source', value: guest.leadSource },
    { label: 'Curious about', value: guest.preferredRole },
    { label: 'Added', value: formatDate(guest.createdAt) },
  ].filter((f) => f.value);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-12 sm:px-6">
      <Link
        href={`/clubs/${clubUnitId}/guests`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Guests
      </Link>

      <header className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <Avatar name={guest.fullName} photoUrl={guest.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold break-words sm:text-2xl">
            {redacted ? 'Details removed' : guest.fullName}
          </h1>
          <div className="mt-1.5">
            <GuestStatusBadge status={guest.pipelineStatus} />
          </div>
        </div>
      </header>

      {!redacted && (guest.phone || wa || guest.email) && (
        <div className="grid grid-cols-3 gap-2">
          {guest.phone && (
            <a
              href={`tel:${guest.phone}`}
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
          {guest.email && (
            <a
              href={`mailto:${guest.email}`}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-xs text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <MailIcon className="size-4" />
              Email
            </a>
          )}
        </div>
      )}

      <GuestDetailActions clubUnitId={clubUnitId} guest={guest} />

      {(facts.length > 0 || guest.bio) && (
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
          {guest.bio && (
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {guest.bio}
            </p>
          )}
        </section>
      )}

      {/* The 180-day retention clock is a promise to the guest — surface it. */}
      {!redacted && guest.pipelineStatus !== 'joined' && (
        <p className="text-xs text-muted-foreground">
          {daysLeft > 0
            ? `Contact details are deleted automatically in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${formatDate(guest.deleteAfter)}) unless they join.`
            : 'Contact details are past their retention window and will be removed on the next nightly run.'}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Activity</h2>
          {!redacted && (
            <LogActivity clubUnitId={clubUnitId} guestId={guestId} meetings={meetings} />
          )}
        </div>
        <GuestActivity visits={visits} communications={communications} meetings={meetings} />
      </section>
    </main>
  );
}
