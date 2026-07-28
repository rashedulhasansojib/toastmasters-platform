import { z } from 'zod';

export const permissionAction = z.enum(['read', 'create', 'update', 'approve', 'export', 'delete']);
export type PermissionAction = z.infer<typeof permissionAction>;

export const permissionCondition = z.enum(['any', 'own', 'assigned', 'party', 'published']);
export type PermissionCondition = z.infer<typeof permissionCondition>;

/** rbac-design.md §7.3: "Why can Karim read the ledger?" */
export const explainQuerySchema = z.object({
  personId: z.uuid(),
  resource: z.string().min(1),
  action: permissionAction,
  scope: z.string().min(1), // ltree path
});
export type ExplainQuery = z.infer<typeof explainQuerySchema>;

export const explainResponseSchema = z.object({
  personLabel: z.string(),
  allowed: z.boolean(),
  reason: z.string(),
  text: z.string(),
});
export type ExplainResponse = z.infer<typeof explainResponseSchema>;

/** rbac-design.md §7.3: "Show everything Karim can do at Club 1234." */
export const whatCanDoAtQuerySchema = z.object({
  personId: z.uuid(),
  scope: z.string().min(1),
});
export type WhatCanDoAtQuery = z.infer<typeof whatCanDoAtQuerySchema>;

export const capabilitySchema = z.object({
  resource: z.string(),
  action: permissionAction,
  condition: permissionCondition,
});
export type Capability = z.infer<typeof capabilitySchema>;

/**
 * rbac-design.md §7.3: "Show everyone who can read finance.ledger anywhere."
 * `scope` gates the caller's own access to run this query (they must hold
 * platform.audit:read at the given scope — the region root means "anywhere").
 */
export const whoCanAccessQuerySchema = z.object({
  resource: z.string().min(1),
  action: permissionAction,
  scope: z.string().min(1),
});
export type WhoCanAccessQuery = z.infer<typeof whoCanAccessQuerySchema>;

/** M2 Slice 3: a per-unit permission override (FR-AUTHZ-9/10). Role-subject only — see the Slice 3 plan's scoping note. */
export const unitPolicyGrant = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  subjectRole: z.string().min(1),
  resource: z.string().min(1),
  action: permissionAction,
  condition: permissionCondition,
  effect: z.enum(['allow', 'deny']),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  reason: z.string().min(1),
  expiresAt: z.iso.datetime().nullable(),
});
export type UnitPolicyGrant = z.infer<typeof unitPolicyGrant>;

export const createUnitPolicyGrantRequestSchema = z
  .object({
    subjectRole: z.string().min(1),
    resource: z.string().min(1),
    action: permissionAction,
    effect: z.enum(['allow', 'deny']),
    reason: z.string().min(1),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export type CreateUnitPolicyGrantRequest = z.infer<typeof createUnitPolicyGrantRequestSchema>;

export const accessHolderSchema = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  scope: z.string(),
  via: z.string(),
});
export type AccessHolder = z.infer<typeof accessHolderSchema>;
