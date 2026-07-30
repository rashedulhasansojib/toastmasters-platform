import { getOrgTreeLevel } from '@/lib/org-tree';
import { OrgTreeBrowser } from '@/components/platform/OrgTreeBrowser';

/** One level of the org-tree browser — the direct children of `unitId`. */
export default async function OrgTreeLevelPage({
  params,
}: {
  params: Promise<{ regionUnitId: string; unitId: string }>;
}) {
  const { regionUnitId, unitId } = await params;
  const level = await getOrgTreeLevel(regionUnitId, unitId);

  if (!level) {
    return (
      <main className="page">
        <h1>Org tree</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to this unit, or it no longer exists.
        </p>
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
