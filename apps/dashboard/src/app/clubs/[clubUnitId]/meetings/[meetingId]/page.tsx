import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAgendaItems,
  getAgendaTemplates,
  getChecklistRuns,
  getChecklistTemplates,
  getMeeting,
  getRoleAssignments,
  getSpeechSlots,
} from '@/lib/meetings';
import { AgendaItemsList } from '@/components/agenda/AgendaItemsList';
import { AddAgendaItemForm } from '@/components/agenda/AddAgendaItemForm';
import { ApplyAgendaTemplateButton } from '@/components/agenda/ApplyAgendaTemplateButton';
import { MeetingStatusActions } from '@/components/meetings/MeetingStatusActions';
import { AssignRoleForm } from '@/components/roles/AssignRoleForm';
import { RoleAssignmentsList } from '@/components/roles/RoleAssignmentsList';
import { RequestSpeechSlotForm } from '@/components/speechslots/RequestSpeechSlotForm';
import { SpeechSlotsList } from '@/components/speechslots/SpeechSlotsList';
import { ChecklistRunsList } from '@/components/checklists/ChecklistRunsList';
import { StartChecklistRunButton } from '@/components/checklists/StartChecklistRunButton';

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; meetingId: string }>;
}) {
  const { clubUnitId, meetingId } = await params;
  const [
    meeting,
    items,
    templates,
    roleAssignments,
    speechSlots,
    checklistTemplates,
    checklistRuns,
  ] = await Promise.all([
    getMeeting(clubUnitId, meetingId),
    getAgendaItems(clubUnitId, meetingId),
    getAgendaTemplates(clubUnitId),
    getRoleAssignments(clubUnitId, meetingId),
    getSpeechSlots(clubUnitId, meetingId),
    getChecklistTemplates(clubUnitId),
    getChecklistRuns(clubUnitId, meetingId),
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

      <section className="flex flex-col gap-3">
        <h2>Roles</h2>
        <AssignRoleForm clubUnitId={clubUnitId} meetingId={meetingId} />
        <RoleAssignmentsList
          clubUnitId={clubUnitId}
          meetingId={meetingId}
          assignments={roleAssignments}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Speech slots</h2>
        <RequestSpeechSlotForm clubUnitId={clubUnitId} meetingId={meetingId} />
        <SpeechSlotsList clubUnitId={clubUnitId} meetingId={meetingId} slots={speechSlots} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Checklists</h2>
        <StartChecklistRunButton
          clubUnitId={clubUnitId}
          meetingId={meetingId}
          templates={checklistTemplates}
        />
        <ChecklistRunsList clubUnitId={clubUnitId} meetingId={meetingId} runs={checklistRuns} />
      </section>
    </main>
  );
}
