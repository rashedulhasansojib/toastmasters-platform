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
