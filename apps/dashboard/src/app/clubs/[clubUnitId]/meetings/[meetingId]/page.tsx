import { notFound } from 'next/navigation';
import {
  getAgendaItems,
  getAttendanceRoster,
  getBallots,
  getChecklistRuns,
  getChecklistTemplates,
  getClubMembers,
  getLiveRecords,
  getMeeting,
  getMeetingGuests,
  getMeetingResources,
  getPathways,
  getRoleAssignments,
  getSpeechSlots,
} from '@/lib/meetings';
import { listGuests } from '@/lib/membership';
import { MeetingWorkspace } from '@/components/meetings/detail/MeetingWorkspace';

/**
 * M9: the meeting workspace — the legacy portal's tabbed meeting page.
 *
 * Everything the eight tabs need is fetched here in one parallel batch and
 * handed to a single client component, so switching tabs is instant and
 * there is no client-side waterfall on a phone at a venue.
 */
export default async function MeetingPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; meetingId: string }>;
}) {
  const { clubUnitId, meetingId } = await params;

  const [
    meeting,
    members,
    roleAssignments,
    speechSlots,
    pathways,
    guests,
    clubGuests,
    attendance,
    resources,
    liveRecords,
    checklistTemplates,
    checklistRuns,
    ballots,
    agendaItems,
  ] = await Promise.all([
    getMeeting(clubUnitId, meetingId),
    getClubMembers(clubUnitId),
    getRoleAssignments(clubUnitId, meetingId),
    getSpeechSlots(clubUnitId, meetingId),
    getPathways(clubUnitId),
    getMeetingGuests(clubUnitId, meetingId),
    listGuests(clubUnitId),
    getAttendanceRoster(clubUnitId, meetingId),
    getMeetingResources(clubUnitId, meetingId),
    getLiveRecords(clubUnitId, meetingId),
    getChecklistTemplates(clubUnitId),
    getChecklistRuns(clubUnitId, meetingId),
    getBallots(clubUnitId, meetingId),
    getAgendaItems(clubUnitId, meetingId),
  ]);

  if (!meeting) notFound();

  return (
    <MeetingWorkspace
      clubUnitId={clubUnitId}
      meeting={meeting}
      members={members}
      roleAssignments={roleAssignments}
      speechSlots={speechSlots}
      pathways={pathways}
      guests={guests}
      clubGuests={clubGuests}
      attendance={attendance}
      resources={resources}
      liveRecords={liveRecords}
      checklistTemplates={checklistTemplates}
      checklistRuns={checklistRuns}
      ballots={ballots}
      agendaItems={agendaItems}
    />
  );
}
