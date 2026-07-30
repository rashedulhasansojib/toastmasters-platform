import { getOrgTreeLevel } from '@/lib/org-tree';
import { OrgTreeBrowser } from '@/components/platform/OrgTreeBrowser';

/** The org-tree browser's root level — the top-level org units (today, the single region). */
export default async function OrgTreeRootPage({
  params,
}: {
  params: Promise<{ regionUnitId: string }>;
}) {
  const { regionUnitId } = await params;
  const level = await getOrgTreeLevel(regionUnitId);

  if (!level) {
    return (
      <main className="page">
        <h1>Org tree</h1>
        <p className="text-sm text-muted-foreground">You do not have access to the org tree.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <OrgTreeBrowser
        regionUnitId={regionUnitId}
        ancestors={level.ancestors}
        childUnits={level.children}
      />
    </main>
  );
}
