import { getUpcomingMeetings } from '@/lib/membership';

/** M4 Slice 10: the club's public page — no session, no capability token, matching `PublicMeetingController`'s `@Public()` route. */
export default async function ClubPublicPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const meetings = await getUpcomingMeetings(clubUnitId);

  return (
    <main className="page flex flex-col gap-3">
      <h1>Upcoming meetings</h1>
      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {meetings.map((m) => (
            <li key={m.id}>{new Date(m.scheduledAt).toLocaleString()}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        Ask a club officer for a guest link to let them know you&apos;re coming.
      </p>
    </main>
  );
}
