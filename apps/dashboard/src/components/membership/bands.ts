import {
  memberHealthBand,
  type MemberHealthBand,
  type ClubMemberType,
} from '@toastmasters/contracts';

/** CLAUDE.md §2 decision 11 (2026-07-30): the member-health signal v1's four bands. */
export const HEALTH_BANDS = memberHealthBand.options;

export const BAND_LABEL: Record<MemberHealthBand, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  at_risk: 'At risk',
  disengaged: 'Disengaged',
};

/** Worst-first, so an "any signal" filter can just take the first N bands. */
export const BAND_SEVERITY: Record<MemberHealthBand, number> = {
  disengaged: 3,
  at_risk: 2,
  watch: 1,
  healthy: 0,
};

export const BAND_ACCENT: Record<MemberHealthBand, string> = {
  healthy: 'bg-emerald-500',
  watch: 'bg-amber-500',
  at_risk: 'bg-orange-500',
  disengaged: 'bg-rose-500',
};

export const BAND_CHIP: Record<MemberHealthBand, string> = {
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  watch: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  at_risk: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  disengaged: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export const MEMBER_TYPE_LABEL: Record<ClubMemberType, string> = {
  new: 'New',
  renewing: 'Renewing',
  dual: 'Dual',
  reinstated: 'Reinstated',
  charter: 'Charter',
  transfer: 'Transfer',
  honorary: 'Honorary',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
