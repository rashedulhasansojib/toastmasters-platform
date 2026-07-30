export type MemberHealthBand = 'healthy' | 'watch' | 'at_risk' | 'disengaged';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the member-health signal v1's
 * thresholds. `days` is days since the reference date (last speech, or
 * `joinedAt` if the member has never spoken).
 */
export function bandFor(days: number): MemberHealthBand {
  if (days <= 60) return 'healthy';
  if (days <= 90) return 'watch';
  if (days <= 180) return 'at_risk';
  return 'disengaged';
}
