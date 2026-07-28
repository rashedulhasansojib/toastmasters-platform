/** The six actions a grant can permit. */
export type Action = 'read' | 'create' | 'update' | 'approve' | 'export' | 'delete';

/** Conditions that narrow a grant to a subset of matching resources. */
export type Condition = 'any' | 'own' | 'assigned' | 'party' | 'published';

export type Effect = 'allow' | 'deny';

/**
 * Which of effectiveGrants()'s four union sources (rbac-design.md §4.2)
 * produced a grant. Purely additive metadata for the access inspector
 * (rbac-design.md §7.3) — evaluate()/scopeCovers()/canDelegate() never read
 * it, so it cannot change an authorization decision.
 */
export type GrantSource =
  | { kind: 'platform'; role: string }
  | { kind: 'domain_role'; role: string; orgUnitId: string }
  | { kind: 'unit_policy'; orgUnitId: string }
  | { kind: 'direct'; reason: string };

/**
 * A resolved permission grant (role assignment × role-template rule).
 * Produced in M1 from the seeded catalog + assignments; consumed by evaluate().
 */
export interface Grant {
  role: string;
  /** ltree path of the scope node this applies at, e.g. "district.42.area.7.club.318". */
  scope: string;
  /**
   * true for a role_template.scope_rule = 'self_unit' grant: the target scope
   * must equal this grant's scope exactly, not merely fall beneath it.
   * Absent/false = today's prefix-or-equal behaviour (self_subtree).
   */
  exactOnly?: boolean;
  /** Resource key from the catalog, e.g. "finance.ledger". */
  resource: string;
  action: Action;
  condition: Condition;
  effect: Effect;
  /** Where this grant came from — see GrantSource. Absent for hand-built test fixtures. */
  source?: GrantSource;
}

/** The authenticated caller. */
export interface Principal {
  userId: string;
  roles: string[];
  /** ltree scope paths the principal is assigned within. */
  scopes: string[];
  /**
   * Session claims (Slice 8) — UI convenience only, never read by authorize()
   * or scopeCovers(). Absent for hand-built test fixtures.
   */
  activeUnitId?: string | null;
  programYearId?: string | null;
  /** permissionVersion at the session's issuance — never used for authz decisions. */
  v?: number;
}

/** A single access question, assembled by the ResourceGuard. */
export interface AccessRequest {
  principal: Principal;
  resource: string;
  action: Action;
  /** ltree path of the target resource (or its owning node). */
  scope: string;
  /** Ownership / relationship facts used to test conditions. */
  context?: {
    isOwner?: boolean;
    isAssigned?: boolean;
    isParty?: boolean;
    isPublished?: boolean;
  };
}

export interface AccessDecision {
  allowed: boolean;
  /** Machine-readable rationale: 'granted' | 'explicit-deny' | 'default-deny'. */
  reason: string;
}
