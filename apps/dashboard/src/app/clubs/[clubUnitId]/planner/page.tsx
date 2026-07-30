import { getPlanner } from '@/lib/meetings';
import { PlannerScreen } from '@/components/planner/PlannerScreen';

export default async function ClubPlannerPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const rows = await getPlanner(clubUnitId);

  // Full width, not the narrow `.page` container — the grid is 14 columns.
  return (
    <main className="mx-auto w-full max-w-[110rem]">
      <PlannerScreen clubUnitId={clubUnitId} rows={rows} />
    </main>
  );
}
