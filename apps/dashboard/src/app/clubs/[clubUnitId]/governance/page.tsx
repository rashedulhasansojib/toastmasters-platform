import { listExComMeetings, listMinutes } from '@/lib/governance';
import { getMySupportProfile, listSupportRequests } from '@/lib/support';
import { getSession } from '@/lib/session';
import { ExComPanel } from '@/components/governance/ExComPanel';
import { MinutesPanel } from '@/components/governance/MinutesPanel';
import { SupportPanel } from '@/components/support/SupportPanel';

export default async function ClubGovernancePage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const session = await getSession();
  const programYearId = session?.programYearId ?? null;

  const [meetings, minutesList, supportProfile, supportRequests] = await Promise.all([
    listExComMeetings(clubUnitId),
    listMinutes(clubUnitId),
    getMySupportProfile(),
    listSupportRequests(clubUnitId),
  ]);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Governance</h1>

      <section className="flex flex-col gap-3">
        <h2>ExCom meetings &amp; motions</h2>
        <ExComPanel clubUnitId={clubUnitId} programYearId={programYearId} meetings={meetings} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Minutes</h2>
        <MinutesPanel clubUnitId={clubUnitId} items={minutesList} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Cross-club support</h2>
        <SupportPanel clubUnitId={clubUnitId} profile={supportProfile} requests={supportRequests} />
      </section>
    </main>
  );
}
