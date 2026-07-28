import { getAgendaTemplates, getChecklistTemplates, listMeetings } from '@/lib/meetings';
import { getSession } from '@/lib/session';
import { MeetingsList } from '@/components/meetings/MeetingsList';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';
import { AgendaTemplatesList } from '@/components/agenda/AgendaTemplatesList';
import { CreateAgendaTemplateForm } from '@/components/agenda/CreateAgendaTemplateForm';
import { ChecklistTemplatesList } from '@/components/checklists/ChecklistTemplatesList';
import { CreateChecklistTemplateForm } from '@/components/checklists/CreateChecklistTemplateForm';

export default async function ClubMeetingsPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const [meetings, session, agendaTemplates, checklistTemplates] = await Promise.all([
    listMeetings(clubUnitId),
    getSession(),
    getAgendaTemplates(clubUnitId),
    getChecklistTemplates(clubUnitId),
  ]);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Meetings</h1>
      <CreateMeetingForm clubUnitId={clubUnitId} programYearId={session?.programYearId ?? null} />
      <MeetingsList clubUnitId={clubUnitId} meetings={meetings} />

      <section className="flex flex-col gap-3">
        <h2>Agenda templates</h2>
        <CreateAgendaTemplateForm clubUnitId={clubUnitId} />
        <AgendaTemplatesList templates={agendaTemplates} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Checklists</h2>
        <CreateChecklistTemplateForm clubUnitId={clubUnitId} />
        <ChecklistTemplatesList templates={checklistTemplates} />
      </section>
    </main>
  );
}
