import Link from 'next/link';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Meeting, MeetingStatus } from '@toastmasters/contracts';

/**
 * Three-section bucketing:
 *  - Current : status='in_progress', OR scheduled on today's calendar day
 *              and not yet closed/cancelled — the meeting a member would
 *              open right now.
 *  - Upcoming: scheduledAt > today AND status ∈ {draft, published}.
 *  - Past    : status ∈ {closed, cancelled} OR scheduledAt < today.
 *
 * Bucketing runs on the server (this is a server component). `Date.now()`
 * is fine here — no memoisation concerns.
 */

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function bucketize(meetings: Meeting[]): {
  current: Meeting[];
  upcoming: Meeting[];
  past: Meeting[];
} {
  const now = new Date();
  const current: Meeting[] = [];
  const upcoming: Meeting[] = [];
  const past: Meeting[] = [];

  for (const m of meetings) {
    const scheduled = new Date(m.scheduledAt);
    const isTerminal = m.status === 'closed' || m.status === 'cancelled';

    if (m.status === 'in_progress') {
      current.push(m);
    } else if (isTerminal) {
      past.push(m);
    } else if (isSameCalendarDay(scheduled, now)) {
      current.push(m);
    } else if (scheduled.getTime() < now.getTime()) {
      past.push(m);
    } else {
      upcoming.push(m);
    }
  }

  current.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  upcoming.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  past.sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));

  return { current, upcoming, past };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_VARIANT: Record<MeetingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  published: 'secondary',
  in_progress: 'default',
  closed: 'outline',
  cancelled: 'destructive',
};

function MeetingCard({ clubUnitId, meeting }: { clubUnitId: string; meeting: Meeting }) {
  const title = meeting.theme || meeting.title || 'Untitled meeting';
  const subline = meeting.theme && meeting.title ? meeting.title : null;

  return (
    <Link
      href={`/clubs/${clubUnitId}/meetings/${meeting.id}`}
      className="block"
      aria-label={`Open meeting ${title}`}
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                {typeof meeting.meetingNumber === 'number' && (
                  <span className="font-medium">Meeting #{meeting.meetingNumber}</span>
                )}
                <Badge variant={STATUS_VARIANT[meeting.status]} className="text-xs">
                  {meeting.status.replace('_', ' ')}
                </Badge>
              </div>
              <h3 className="truncate font-semibold text-sm leading-snug">{title}</h3>
              {subline && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subline}</p>
              )}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <span>
              {formatDate(meeting.scheduledAt)} · {formatTime(meeting.scheduledAt)}
            </span>
          </div>
          {meeting.venue && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{meeting.venue}</span>
            </div>
          )}
          {meeting.tableTopicQuestions && meeting.tableTopicQuestions.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5 shrink-0" aria-hidden />
              <span>
                {meeting.tableTopicQuestions.length} table topic
                {meeting.tableTopicQuestions.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function Section({
  title,
  meetings,
  clubUnitId,
  emptyLabel,
}: {
  title: string;
  meetings: Meeting[];
  clubUnitId: string;
  emptyLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}{' '}
        <span className="ml-1 text-muted-foreground/60 normal-case">({meetings.length})</span>
      </h2>
      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {emptyLabel ?? `No ${title.toLowerCase()} meetings.`}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((m) => (
            <MeetingCard key={m.id} clubUnitId={clubUnitId} meeting={m} />
          ))}
        </div>
      )}
    </section>
  );
}

export function MeetingsList({
  clubUnitId,
  meetings,
}: {
  clubUnitId: string;
  meetings: Meeting[];
}) {
  const { current, upcoming, past } = bucketize(meetings);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Current"
        meetings={current}
        clubUnitId={clubUnitId}
        emptyLabel="No meeting is running right now."
      />
      <Section
        title="Upcoming"
        meetings={upcoming}
        clubUnitId={clubUnitId}
        emptyLabel="No upcoming meetings scheduled."
      />
      <Section
        title="Past"
        meetings={past}
        clubUnitId={clubUnitId}
        emptyLabel="No past meetings yet."
      />
    </div>
  );
}
