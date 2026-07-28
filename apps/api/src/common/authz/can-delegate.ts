import type { Action, Grant } from './authz.types';
import { scopeCovers } from './evaluate';

/**
 * rbac-design.md §7.4: an actor may only delegate (grant to someone else) a
 * resource/action it already holds `allow` for at a scope covering the
 * target. This is the one guard every grant-creation path must pass through
 * — including what an invitation carrying roles would call — or invites
 * become a privilege-escalation route (§11).
 */
export function canDelegate(
  actorGrants: readonly Grant[],
  target: { resource: string; action: Action; scope: string },
): boolean {
  return actorGrants.some(
    (g) =>
      g.effect === 'allow' &&
      g.resource === target.resource &&
      g.action === target.action &&
      scopeCovers(g.scope, target.scope, g.exactOnly),
  );
}
