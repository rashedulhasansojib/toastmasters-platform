import {
  listVisitReports,
  listContactLog,
  getDcpProjection,
  listHealthSnapshots,
} from '@/lib/quality';
import { getClubSuccessPlan } from '@/lib/governance';
import { getSession } from '@/lib/session';
import { VisitReportForm } from '@/components/quality/VisitReportForm';
import { VisitReportsList } from '@/components/quality/VisitReportsList';
import { ContactLogPanel } from '@/components/quality/ContactLogPanel';
import { DcpProjectionCard } from '@/components/quality/DcpProjectionCard';
import { HealthSnapshotsList } from '@/components/quality/HealthSnapshotsList';
import { ClubSuccessPlanPanel } from '@/components/governance/ClubSuccessPlanPanel';

export default async function ClubQualityPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const session = await getSession();
  const programYearId = session?.programYearId ?? null;

  const [visitReports, contactLogs, dcpProjection, healthSnapshots, successPlan] =
    await Promise.all([
      listVisitReports(clubUnitId),
      listContactLog(clubUnitId),
      getDcpProjection(clubUnitId, programYearId),
      listHealthSnapshots(clubUnitId),
      getClubSuccessPlan(clubUnitId, programYearId),
    ]);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Quality &amp; Success Plan</h1>

      <section className="flex flex-col gap-3">
        <h2>DCP projection</h2>
        <DcpProjectionCard projection={dcpProjection} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Club Success Plan</h2>
        <ClubSuccessPlanPanel
          clubUnitId={clubUnitId}
          programYearId={programYearId}
          plan={successPlan}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Area visit reports</h2>
        <VisitReportForm clubUnitId={clubUnitId} programYearId={programYearId} />
        <VisitReportsList clubUnitId={clubUnitId} reports={visitReports} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>President contact log</h2>
        <ContactLogPanel clubUnitId={clubUnitId} programYearId={programYearId} logs={contactLogs} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Club health snapshots</h2>
        <HealthSnapshotsList snapshots={healthSnapshots} />
      </section>
    </main>
  );
}
