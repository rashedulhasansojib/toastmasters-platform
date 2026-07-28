import Link from 'next/link';
import { getLiveRecords } from '@/lib/meetings';
import { TimerTool } from '@/components/live/TimerTool';
import { AhCounterTool } from '@/components/live/AhCounterTool';
import { GrammarianTool } from '@/components/live/GrammarianTool';
import { LiveRecordsList } from '@/components/live/LiveRecordsList';

export default async function MeetingLivePage({
  params,
}: {
  params: Promise<{ clubUnitId: string; meetingId: string }>;
}) {
  const { clubUnitId, meetingId } = await params;
  const records = await getLiveRecords(clubUnitId, meetingId);

  return (
    <main className="page flex flex-col gap-6">
      <Link
        href={`/clubs/${clubUnitId}/meetings/${meetingId}`}
        className="text-sm text-muted-foreground"
      >
        ← Meeting
      </Link>
      <h1>Live meeting-day tools</h1>

      <section className="flex flex-col gap-3">
        <h2>Timer</h2>
        <TimerTool clubUnitId={clubUnitId} meetingId={meetingId} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Ah-Counter</h2>
        <AhCounterTool clubUnitId={clubUnitId} meetingId={meetingId} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Grammarian</h2>
        <GrammarianTool clubUnitId={clubUnitId} meetingId={meetingId} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Recorded so far</h2>
        <LiveRecordsList records={records} />
      </section>
    </main>
  );
}
