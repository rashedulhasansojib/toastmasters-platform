import { getAgendaItems } from '@/lib/meetings';
import { AgendaItemsList } from '@/components/agenda/AgendaItemsList';
import { AddAgendaItemForm } from '@/components/agenda/AddAgendaItemForm';

export default async function MeetingAgendaPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; meetingId: string }>;
}) {
  const { clubUnitId, meetingId } = await params;
  const items = await getAgendaItems(clubUnitId, meetingId);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Agenda</h1>
      <AddAgendaItemForm clubUnitId={clubUnitId} meetingId={meetingId} />
      <AgendaItemsList items={items} />
    </main>
  );
}
