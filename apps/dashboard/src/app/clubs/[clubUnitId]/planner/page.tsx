import { redirect } from 'next/navigation';
import { getAgendaTemplates, getClubMembers, getPlanner } from '@/lib/meetings';
import { listGuests } from '@/lib/membership';
import { getSession } from '@/lib/session';
import { PlannerScreen } from '@/components/planner/PlannerScreen';

export default async function ClubPlannerPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const [rows, members, guests, agendaTemplates] = await Promise.all([
    getPlanner(clubUnitId),
    getClubMembers(clubUnitId),
    listGuests(clubUnitId),
    getAgendaTemplates(clubUnitId),
  ]);

  // Full width, not the narrow `.page` container — the grid is 14 columns.
  return (
    <main className="mx-auto w-full max-w-[110rem]">
      <PlannerScreen
        clubUnitId={clubUnitId}
        rows={rows}
        members={members}
        guests={guests}
        agendaTemplates={agendaTemplates.filter((t) => t.isActive)}
        programYearId={session.programYearId ?? null}
      />
    </main>
  );
}
