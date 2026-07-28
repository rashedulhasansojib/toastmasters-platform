import { listMeetings } from '@/lib/meetings';
import { getSession } from '@/lib/session';
import { MeetingsList } from '@/components/meetings/MeetingsList';
import { CreateMeetingForm } from '@/components/meetings/CreateMeetingForm';

export default async function ClubMeetingsPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const [meetings, session] = await Promise.all([listMeetings(clubUnitId), getSession()]);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Meetings</h1>
      <CreateMeetingForm clubUnitId={clubUnitId} programYearId={session?.programYearId ?? null} />
      <MeetingsList clubUnitId={clubUnitId} meetings={meetings} />
    </main>
  );
}
