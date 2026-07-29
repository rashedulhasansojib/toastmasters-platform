import type { Meeting, GuestCommunication, GuestVisit } from '@toastmasters/contracts';
import {
  CalendarCheckIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

import { CHANNEL_LABEL, formatDate } from './pipeline';

const CHANNEL_ICON: Record<GuestCommunication['channel'], LucideIcon> = {
  call: PhoneIcon,
  message: MessageCircleIcon,
  email: MailIcon,
  in_person: UsersIcon,
  other: MessageCircleIcon,
};

type Entry = {
  id: string;
  at: string;
  Icon: LucideIcon;
  title: string;
  detail?: string;
};

/**
 * Visits and contacts are separate append-only tables but one story to the
 * person reading them, so they're merged into a single reverse-chronological
 * trail rather than two lists you have to interleave in your head.
 */
export function GuestActivity({
  visits,
  communications,
  meetings,
}: {
  visits: GuestVisit[];
  communications: GuestCommunication[];
  meetings: Meeting[];
}) {
  const meetingById = new Map(meetings.map((m) => [m.id, m]));

  const entries: Entry[] = [
    ...visits.map((visit) => {
      const meeting = meetingById.get(visit.meetingId);
      return {
        id: `visit-${visit.id}`,
        at: visit.attendedAt,
        Icon: CalendarCheckIcon,
        title: 'Attended a meeting',
        detail:
          meeting?.title ?? (meeting?.meetingNumber ? `#${meeting.meetingNumber}` : undefined),
      };
    }),
    ...communications.map((communication) => ({
      id: `comm-${communication.id}`,
      at: communication.loggedAt,
      Icon: CHANNEL_ICON[communication.channel],
      title: CHANNEL_LABEL[communication.channel],
      detail: communication.note,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Nothing logged yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => (
        <li key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <entry.Icon className="size-3.5" />
            </span>
            {index < entries.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{entry.title}</p>
              <time dateTime={entry.at} className="text-xs text-muted-foreground">
                {formatDate(entry.at)}
              </time>
            </div>
            {entry.detail && (
              <p className="mt-0.5 text-sm wrap-break-word text-muted-foreground">{entry.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
