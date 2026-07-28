import { notFound } from 'next/navigation';
import { getProspect, getProspectVisits, getProspectCommunications } from '@/lib/membership';
import { UpdateProspectStatusForm } from '@/components/prospects/UpdateProspectStatusForm';
import { ConvertProspectButton } from '@/components/prospects/ConvertProspectButton';
import { LogVisitForm } from '@/components/prospects/LogVisitForm';
import { VisitsList } from '@/components/prospects/VisitsList';
import { LogCommunicationForm } from '@/components/prospects/LogCommunicationForm';
import { CommunicationsList } from '@/components/prospects/CommunicationsList';

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ clubUnitId: string; prospectId: string }>;
}) {
  const { clubUnitId, prospectId } = await params;
  const [prospect, visits, communications] = await Promise.all([
    getProspect(clubUnitId, prospectId),
    getProspectVisits(clubUnitId, prospectId),
    getProspectCommunications(clubUnitId, prospectId),
  ]);
  if (!prospect) notFound();

  return (
    <main className="page flex flex-col gap-6">
      <h1>{prospect.fullName}</h1>
      <dl className="text-sm text-muted-foreground">
        {prospect.email && <p>{prospect.email}</p>}
        {prospect.phone && <p>{prospect.phone}</p>}
        {prospect.leadSource && <p>Lead source: {prospect.leadSource}</p>}
      </dl>

      <section className="flex flex-col gap-3">
        <h2>Pipeline status</h2>
        <UpdateProspectStatusForm clubUnitId={clubUnitId} prospect={prospect} />
        <ConvertProspectButton clubUnitId={clubUnitId} prospect={prospect} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Visits</h2>
        <LogVisitForm clubUnitId={clubUnitId} prospectId={prospectId} />
        <VisitsList visits={visits} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Communications</h2>
        <LogCommunicationForm clubUnitId={clubUnitId} prospectId={prospectId} />
        <CommunicationsList communications={communications} />
      </section>
    </main>
  );
}
