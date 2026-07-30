import { listGuests, getMembershipRoster } from '@/lib/membership';
import { VpMembershipDashboard } from '@/components/membership/VpMembershipDashboard';

export default async function ClubMembershipPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const [members, guests] = await Promise.all([
    getMembershipRoster(clubUnitId),
    listGuests(clubUnitId),
  ]);

  // Same full-width treatment as the guests board — the two-column desktop
  // layout needs the room, and the phone tabs are edge-to-edge by design.
  return (
    <main className="mx-auto w-full max-w-7xl">
      <VpMembershipDashboard clubUnitId={clubUnitId} members={members} guests={guests} />
    </main>
  );
}
