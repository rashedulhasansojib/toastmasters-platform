import { listProspects } from '@/lib/membership';
import { CreateProspectForm } from '@/components/prospects/CreateProspectForm';
import { ProspectsList } from '@/components/prospects/ProspectsList';

export default async function ClubProspectsPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const prospects = await listProspects(clubUnitId);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Prospects</h1>
      <CreateProspectForm clubUnitId={clubUnitId} />
      <ProspectsList clubUnitId={clubUnitId} prospects={prospects} />
    </main>
  );
}
