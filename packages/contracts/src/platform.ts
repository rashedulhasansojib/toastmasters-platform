import { z } from 'zod';
import { orgUnit, orgUnitType } from './org';

/**
 * The platform-tier admin console (super-admin dashboard).
 *
 * Gated on the seeded `platform.console` resource, which no role template
 * grants — so only `system_admin` reaches it, via the non-restricted
 * synthesis in access.repository.ts. There is deliberately no role name in
 * this contract: the dashboard renders from the grant, not from `isAdmin`
 * (CLAUDE.md §5).
 *
 * Scope note: the console is read at the region root, the single root the
 * `org_unit_single_region_root` unique index allows (CLAUDE.md §2, decision
 * 6). It reports one region, not a list — a multi-region tree would presume
 * an answer to open decision 10.
 */
export const platformUnitCounts = z.object({
  district: z.number().int().nonnegative(),
  division: z.number().int().nonnegative(),
  area: z.number().int().nonnegative(),
  club: z.number().int().nonnegative(),
});
export type PlatformUnitCounts = z.infer<typeof platformUnitCounts>;

export const platformConsoleSummary = z.object({
  region: orgUnit,
  /** The whole subtree under the region, flat and `path`-ordered. The client nests it; ltree ordering already yields a valid pre-order walk. */
  tree: z.array(orgUnit),
  counts: platformUnitCounts,
  activePeopleCount: z.number().int().nonnegative(),
  programYearId: z.string().min(1).nullable(),
});
export type PlatformConsoleSummary = z.infer<typeof platformConsoleSummary>;

/**
 * Depth ordering of the TI hierarchy. A child must sit strictly deeper than
 * its parent — that rejects a club under a club, or a district under an area.
 *
 * Deliberately *not* strict adjacency (region may only hold a district, and so
 * on): real trees here already hang clubs directly off the region, and this
 * milestone is not the place to invalidate existing data. The console defaults
 * the picker to the conventional next tier; the rule below is the floor.
 */
export const orgUnitTierRank: Record<z.infer<typeof orgUnitType>, number> = {
  international: 0,
  region: 1,
  district: 2,
  division: 3,
  area: 4,
  club: 5,
};

/** The conventional next tier down, used to preselect the console's type picker. */
export const conventionalChildTier: Record<
  z.infer<typeof orgUnitType>,
  z.infer<typeof orgUnitType> | null
> = {
  international: 'region',
  region: 'district',
  district: 'division',
  division: 'area',
  area: 'club',
  club: null,
};
