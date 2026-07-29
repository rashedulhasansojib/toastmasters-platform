import { listLibraryItems, listGovernanceDocuments, listContentPlan } from '@/lib/library';
import { getSession } from '@/lib/session';
import { LibraryUploadForm } from '@/components/library/LibraryUploadForm';
import { LibraryItemsList } from '@/components/library/LibraryItemsList';
import { ContentPlanForm } from '@/components/library/ContentPlanForm';
import { ContentPlanList } from '@/components/library/ContentPlanList';

export default async function ClubLibraryPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const [session, items, governanceDocs, contentPlan] = await Promise.all([
    getSession(),
    listLibraryItems(clubUnitId),
    listGovernanceDocuments(clubUnitId),
    listContentPlan(clubUnitId),
  ]);
  const programYearId = session?.programYearId ?? null;

  return (
    <main className="page flex flex-col gap-6">
      <h1>Library</h1>

      <section className="flex flex-col gap-3">
        <h2>Governance documents</h2>
        <LibraryUploadForm clubUnitId={clubUnitId} isGovernance />
        <LibraryItemsList clubUnitId={clubUnitId} items={governanceDocs} isGovernance />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Documents, media &amp; links</h2>
        <LibraryUploadForm clubUnitId={clubUnitId} isGovernance={false} />
        <LibraryItemsList clubUnitId={clubUnitId} items={items} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Content planner</h2>
        <ContentPlanForm clubUnitId={clubUnitId} programYearId={programYearId} />
        <ContentPlanList clubUnitId={clubUnitId} items={contentPlan} />
      </section>
    </main>
  );
}
