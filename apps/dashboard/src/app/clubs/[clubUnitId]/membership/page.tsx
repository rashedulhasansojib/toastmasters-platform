import { getMembershipRoster } from '@/lib/membership';
import { VpMembershipDashboard } from '@/components/membership/VpMembershipDashboard';

export default async function ClubMembershipPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const members = await getMembershipRoster(clubUnitId);

  return (
    <main className="mx-auto w-full max-w-7xl">
      <VpMembershipDashboard clubUnitId={clubUnitId} members={members} />
    </main>
  );
}
