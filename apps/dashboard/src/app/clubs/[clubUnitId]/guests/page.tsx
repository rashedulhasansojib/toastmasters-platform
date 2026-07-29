import { listGuests } from '@/lib/membership';
import { GuestsScreen } from '@/components/guests/GuestsScreen';

export default async function ClubGuestsPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const guests = await listGuests(clubUnitId);

  // Deliberately not the narrow `.page` container — the wide-screen board needs
  // the full width, and the phone layout is edge-to-edge by design.
  return (
    <main className="mx-auto w-full max-w-7xl">
      <GuestsScreen clubUnitId={clubUnitId} guests={guests} />
    </main>
  );
}
