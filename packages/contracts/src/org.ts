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
