import { listProspects } from '@/lib/membership';
import { ProspectsScreen } from '@/components/prospects/ProspectsScreen';

export default async function ClubProspectsPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const prospects = await listProspects(clubUnitId);

  // Deliberately not the narrow `.page` container — the wide-screen board needs
  // the full width, and the phone layout is edge-to-edge by design.
  return (
    <main className="mx-auto w-full max-w-7xl">
      <ProspectsScreen clubUnitId={clubUnitId} prospects={prospects} />
    </main>
  );
}
