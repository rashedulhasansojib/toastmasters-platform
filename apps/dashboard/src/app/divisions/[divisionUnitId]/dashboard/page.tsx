import { getDivisionDashboard } from '@/lib/governance';
import { getSession } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/** M8 Slice 4: same visit-compliance-led shape as M6's Area dashboard, one tier up — per-area aggregates, never per-club (FR-OVS-3). */
export default async function DivisionDashboardPage({
  params,
}: {
  params: Promise<{ divisionUnitId: string }>;
}) {
  const { divisionUnitId } = await params;
  const session = await getSession();
  const dashboard = await getDivisionDashboard(divisionUnitId, session?.programYearId ?? null);

  if (!dashboard) {
    return (
      <main className="page">
        <h1>Division dashboard</h1>
        <p className="text-sm text-muted-foreground">No data available for this division yet.</p>
      </main>
    );
  }

  return (
    <main className="page flex flex-col gap-6">
      <h1>Division dashboard</h1>
      <section className="flex flex-col gap-3">
        <h2>Area roll-up — visit compliance</h2>
        <Card>
          <CardContent className="flex flex-col gap-3">
            {dashboard.areas.map((area, i) => (
              <div key={area.areaUnitId}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {area.areaName} ({area.totalClubs} clubs)
                  </p>
                  <p className="text-sm text-muted-foreground">
                    R1 {area.r1CompliancePct.toFixed(0)}% · R2 {area.r2CompliancePct.toFixed(0)}%
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
