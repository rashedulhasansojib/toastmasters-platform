import type { AccessDecision, AccessRequest, Condition, Grant } from './authz.types';

/**
 * ltree prefix match: does a grant issued at `grantScope` cover `targetScope`?
 * A grant at "district.42" covers "district.42" and any descendant
 * ("district.42.area.7"), but not "district.43".
 */
export function scopeCovers(grantScope: string, targetScope: string): boolean {
  if (grantScope === targetScope) return true;
  return targetScope.startsWith(`${grantScope}.`);
}

/** Does a grant's condition hold given the request's ownership context? */
export function conditionHolds(condition: Condition, request: AccessRequest): boolean {
  switch (condition) {
    case 'any':
      return true;
    case 'own':
      return request.context?.isOwner === true;
    case 'assigned':
      return request.context?.isAssigned === true;
    case 'party':
      return request.context?.isParty === true;
    case 'published':
      return request.context?.isPublished === true;
    default: {
      // Exhaustiveness: adding a Condition without handling it fails the build.
      const unhandled: never = condition;
      return unhandled;
    }
  }
}

function grantApplies(grant: Grant, request: AccessRequest): boolean {
  return (
    grant.resource === request.resource &&
    grant.action === request.action &&
    scopeCovers(grant.scope, request.scope) &&
    conditionHolds(grant.condition, request)
  );
}

/**
 * The single decision function (rbac-design.md §4). Default-deny, and an
 * explicit deny always beats any allow (deny-beats-allow).
 */
export function evaluate(grants: readonly Grant[], request: AccessRequest): AccessDecision {
  const applicable = grants.filter((grant) => grantApplies(grant, request));

  if (applicable.some((grant) => grant.effect === 'deny')) {
    return { allowed: false, reason: 'explicit-deny' };
  }
  if (applicable.some((grant) => grant.effect === 'allow')) {
    return { allowed: true, reason: 'granted' };
  }
  return { allowed: false, reason: 'default-deny' };
}
