import { getMyRoleAssignments } from './membership';

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): send the VP Membership straight to
 * their dashboard instead of the default `/meetings` landing.
 * `unitLandingPath` stays pure/tier-only on purpose — the sidebar still
 * renders the same club nav for every role (nav-config.ts's own comment:
 * gated by data-fetch, not role name); this is a first-load convenience
 * only, not a permission gate.
 */
export async function vpmLandingOverride(clubUnitId: string): Promise<string | null> {
  const roles = await getMyRoleAssignments(clubUnitId);
  const isVpm = roles.some((r) => r.role === 'club_vpm');
  return isVpm ? `/clubs/${clubUnitId}/membership` : null;
}
