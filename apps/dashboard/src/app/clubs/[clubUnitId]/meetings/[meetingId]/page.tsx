import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAgendaItems, getAgendaTemplates, getMeeting } from '@/lib/meetings';
import { AgendaItemsList } from '@/components/agenda/AgendaItemsList';
import { AddAgendaItemForm } from '@/components/agenda/AddAgendaItemForm';
import { ApplyAgendaTemplateButton } from '@/components/agenda/ApplyAgendaTemplateButton';
import { MeetingStatusActions } from '@/components/meetings/MeetingStatusActions';

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; meetingId: string }>;
}) {
  const { clubUnitId, meetingId } = await params;
  const [meeting, items, templates] = await Promise.all([
    getMeeting(clubUnitId, meetingId),
    getAgendaItems(clubUnitId, meetingId),
    getAgendaTemplates(clubUnitId),
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>Agenda</h2>
          <a
            href={`/api/clubs/${clubUnitId}/meetings/${meetingId}/agenda-print`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            Print agenda
          </a>
        </div>
        <AddAgendaItemForm clubUnitId={clubUnitId} meetingId={meetingId} />
        <ApplyAgendaTemplateButton
          clubUnitId={clubUnitId}
          meetingId={meetingId}
          templates={templates}
        />
        <AgendaItemsList items={items} />
      </section>
    </main>
  );
}
