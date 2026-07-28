import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAgendaItems, getMeeting } from '@/lib/meetings';
import { AgendaItemsList } from '@/components/agenda/AgendaItemsList';
import { AddAgendaItemForm } from '@/components/agenda/AddAgendaItemForm';
import { MeetingStatusActions } from '@/components/meetings/MeetingStatusActions';

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; meetingId: string }>;
}) {
  const { clubUnitId, meetingId } = await params;
  const [meeting, items] = await Promise.all([
    getMeeting(clubUnitId, meetingId),
    getAgendaItems(clubUnitId, meetingId),
  ]);
  if (!meeting) notFound();

  return (
    <main className="page flex flex-col gap-6">
      <Link href={`/clubs/${clubUnitId}/meetings`} className="text-sm text-muted-foreground">
        ← Meetings
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>{new Date(meeting.scheduledAt).toLocaleString()}</h1>
          <p className="text-sm text-muted-foreground">Status: {meeting.status}</p>
        </div>
        <MeetingStatusActions
          clubUnitId={clubUnitId}
          meetingId={meetingId}
          status={meeting.status}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2>Agenda</h2>
        <AddAgendaItemForm clubUnitId={clubUnitId} meetingId={meetingId} />
        <AgendaItemsList items={items} />
      </section>
    </main>
  );
}
