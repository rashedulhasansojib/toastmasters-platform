'use client';

import Link from 'next/link';
import type { Guest } from '@toastmasters/contracts';
import { MailIcon, MessageCircleIcon, PhoneIcon, ShieldOffIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { GuestStatusBadge } from './GuestStatusBadge';
import { isRedacted, whatsappLink } from './pipeline';

/**
 * The phone-first unit of the pipeline. Two interactive zones, never nested:
 * the identity block links through to the detail page, and the status chip is
 * a button that opens the move sheet — so changing a stage is one thumb tap
 * where the desktop board would need a drag.
 */
export function GuestCard({
  clubUnitId,
  guest,
  onRequestMove,
  pending,
}: {
  clubUnitId: string;
  guest: Guest;
  onRequestMove: (guest: Guest) => void;
  pending?: boolean;
}) {
  const redacted = isRedacted(guest);
  const wa = whatsappLink(guest.whatsapp ?? guest.phone);
  const terminal = guest.pipelineStatus === 'joined';
  const actionable = !redacted && (guest.phone || wa || guest.email);

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-card transition-opacity',
        pending && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <Link
          href={`/clubs/${clubUnitId}/guests/${guest.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
        >
          <Avatar name={guest.fullName} photoUrl={guest.photoUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className={cn('truncate font-medium', redacted && 'text-muted-foreground italic')}>
              {redacted ? 'Details removed' : guest.fullName}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {redacted ? (
                <span className="inline-flex items-center gap-1">
                  <ShieldOffIcon className="size-3 shrink-0" />
                  PII expired after 180 days
                </span>
              ) : (
                (guest.phone ?? guest.email ?? guest.leadSource ?? 'No contact details')
              )}
            </p>
          </div>
        </Link>

        {terminal || redacted ? (
          <GuestStatusBadge status={guest.pipelineStatus} className="mt-1 shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => onRequestMove(guest)}
            disabled={pending}
            aria-label={`Move ${guest.fullName} to a different stage`}
            className="mt-0.5 -m-1 shrink-0 rounded-full p-1 active:opacity-70 disabled:opacity-60"
          >
            <GuestStatusBadge status={guest.pipelineStatus} />
          </button>
        )}
      </div>

      {actionable && (
        <div className="flex divide-x border-t text-xs">
          {guest.phone && (
            <a
              href={`tel:${guest.phone}`}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <PhoneIcon className="size-3.5" />
              Call
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <MessageCircleIcon className="size-3.5" />
              WhatsApp
            </a>
          )}
          {guest.email && (
            <a
              href={`mailto:${guest.email}`}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-muted-foreground active:bg-accent sm:hover:bg-accent sm:hover:text-foreground"
            >
              <MailIcon className="size-3.5" />
              Email
            </a>
          )}
        </div>
      )}
    </article>
  );
}
