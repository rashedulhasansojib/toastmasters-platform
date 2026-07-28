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

export const accessHolderSchema = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  scope: z.string(),
  via: z.string(),
});
export type AccessHolder = z.infer<typeof accessHolderSchema>;
