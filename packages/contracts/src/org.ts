import { z } from 'zod';

export const orgUnitType = z.enum([
  'international',
  'region',
  'district',
  'division',
  'area',
  'club',
]);
export type OrgUnitType = z.infer<typeof orgUnitType>;

export const orgUnit = z.object({
  id: z.uuid(),
  type: orgUnitType,
  parentId: z.uuid().nullable(),
  path: z.string().min(1), // ltree, dotted labels: "r1.d41.divA.a1.c1234"
  depth: z.number().int().nonnegative(),
  name: z.string().min(1),
  code: z.string().min(1),
  status: z.enum(['active', 'low', 'ineligible', 'suspended', 'dissolved']),
  timezone: z.string().min(1),
});
export type OrgUnit = z.infer<typeof orgUnit>;

/** Slice 2 (M2): the org tree editor. One shape for every tier — a district under a region, a club under a district. */
export const createOrgUnitChildRequestSchema = z
  .object({
    type: orgUnitType,
    name: z.string().min(1),
    code: z.string().min(1),
    timezone: z.string().min(1),
  })
  .strict();
export type CreateOrgUnitChildRequest = z.infer<typeof createOrgUnitChildRequestSchema>;

export const reparentOrgUnitRequestSchema = z.object({ newParentId: z.uuid() }).strict();
export type ReparentOrgUnitRequest = z.infer<typeof reparentOrgUnitRequestSchema>;

/**
 * Rename / retime a unit. Deliberately excludes `code` and `type`: `code` is a
 * label inside the ltree `path`, so changing it means rewriting the node and
 * every descendant's path (that is what `reparent` is for), and `type` would
 * let a club become a district without moving in the tree.
 */
export const updateOrgUnitRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.timezone !== undefined, {
    message: 'Provide at least one of name or timezone',
  });
export type UpdateOrgUnitRequest = z.infer<typeof updateOrgUnitRequestSchema>;

/** Why a delete was refused — the console lists these so the admin knows what to clear first. */
export const orgUnitDeleteBlocker = z.object({
  relation: z.string().min(1),
  count: z.number().int().positive(),
});
export type OrgUnitDeleteBlocker = z.infer<typeof orgUnitDeleteBlocker>;

/**
 * The org-tree browser's card shape (platform console). `childCount` means two
 * different things depending on `type`: for every tier except `club` it's the
 * count of direct org-unit children (how many districts inside this region,
 * how many clubs inside this area, …); for `club` — a leaf with no org-unit
 * children — it's the active member count instead. One field, not a union,
 * so the client doesn't need to branch on shape, only on label.
 */
export const orgUnitWithCount = orgUnit.extend({
  childCount: z.number().int().nonnegative(),
});
export type OrgUnitWithCount = z.infer<typeof orgUnitWithCount>;

/**
 * One level of the drill-down browser. `ancestors` is root-to-parent
 * *inclusive* of the parent itself — exactly the breadcrumb trail — and empty
 * at the root level (no parent yet, `children` are the top-level regions).
 */
export const orgTreeLevelSchema = z.object({
  ancestors: z.array(orgUnit),
  children: z.array(orgUnitWithCount),
});
export type OrgTreeLevel = z.infer<typeof orgTreeLevelSchema>;

export const orgTreeQuerySchema = z.object({ parentId: z.uuid().optional() }).strict();
export type OrgTreeQuery = z.infer<typeof orgTreeQuerySchema>;

/** "Add new Region" at the top of the browser. Always `type: 'region'` — see `org_unit_single_region_root`. */
export const createOrgUnitRootRequestSchema = z
  .object({
    name: z.string().min(1),
    code: z.string().min(1),
    timezone: z.string().min(1),
  })
  .strict();
export type CreateOrgUnitRootRequest = z.infer<typeof createOrgUnitRootRequestSchema>;
