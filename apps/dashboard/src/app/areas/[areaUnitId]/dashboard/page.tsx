import { getAreaDashboard } from '@/lib/quality';
import { getSession } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/** FR-OVS-6: leads with visit compliance, not attendance — "an Area dashboard that shows attendance but not visit compliance has missed the job." */
export default async function AreaDashboardPage({
  params,
}: {
  params: Promise<{ areaUnitId: string }>;
}) {
  const { areaUnitId } = await params;
  const session = await getSession();
  const dashboard = await getAreaDashboard(areaUnitId, session?.programYearId ?? null);

  if (!dashboard) {
    return (
      <main className="page">
        <h1>Area dashboard</h1>
        <p className="text-sm text-muted-foreground">No data available for this area yet.</p>
      </main>
    );
  }

  return (
    <main className="page flex flex-col gap-6">
      <h1>Area dashboard</h1>

      <section className="flex flex-col gap-3">
        <h2>Visit compliance</h2>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-semibold">{dashboard.r1CompliancePct.toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground">R1 filed (75% due by 30 Nov)</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{dashboard.r2CompliancePct.toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground">R2 filed (75% due by 31 May)</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-3">
            {dashboard.clubs.map((club, i) => (
              <div key={club.clubUnitId}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{club.clubName}</p>
                  <p className="text-sm text-muted-foreground">
                    R1 {club.r1Submitted ? '✓' : '—'} · R2 {club.r2Submitted ? '✓' : '—'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
