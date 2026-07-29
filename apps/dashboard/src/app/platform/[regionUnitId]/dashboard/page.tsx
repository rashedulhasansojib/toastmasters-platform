import type { OrgUnit } from '@toastmasters/contracts';
import { getPlatformConsole } from '@/lib/platform';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The super-admin console. Reachable only by holders of
 * `platform.console`/`read` — in practice `system_admin` alone, since no role
 * template grants it. The 403 is enforced at the API; this page shows the
 * denied state rather than pretending the data is empty.
 */
export default async function PlatformDashboardPage({
  params,
}: {
  params: Promise<{ regionUnitId: string }>;
}) {
  const { regionUnitId } = await params;
  const summary = await getPlatformConsole(regionUnitId);

  if (!summary) {
    return (
      <main className="page">
        <h1>Platform admin</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to the platform console.
        </p>
      </main>
    );
  }

  const { region, tree, counts, activePeopleCount, programYearId } = summary;

  return (
    <main className="page flex flex-col gap-6">
      <div>
        <h1>Platform admin</h1>
        <p className="text-sm text-muted-foreground">
          {region.name} ({region.code}) ·{' '}
          {programYearId ? `Program year ${programYearId}` : 'No current program year'}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2>Org tree</h2>
        <div className="flex flex-wrap gap-6">
          <Stat label="Districts" value={counts.district} />
          <Stat label="Divisions" value={counts.division} />
          <Stat label="Areas" value={counts.area} />
          <Stat label="Clubs" value={counts.club} />
          <Stat label="Active people" value={activePeopleCount} />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-1">
            <UnitRow unit={region} isRoot />
            {tree.length === 0 ? (
              <p className="pt-2 text-sm text-muted-foreground">No units beneath the region yet.</p>
            ) : (
              // `tree` arrives ordered by ltree path, which is already a
              // pre-order walk — indenting by depth is enough to render the
              // hierarchy without building a nested structure.
              tree.map((unit) => <UnitRow key={unit.id} unit={unit} />)
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function UnitRow({ unit, isRoot = false }: { unit: OrgUnit; isRoot?: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1"
      style={{ paddingLeft: `${unit.depth * 1.25}rem` }}
    >
      <span className={isRoot ? 'font-semibold' : 'font-medium'}>{unit.name}</span>
      <span className="text-sm text-muted-foreground">
        {unit.type} · {unit.code}
        {unit.status !== 'active' && ` · ${unit.status}`}
      </span>
    </div>
  );
}
