import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  Gavel,
  GraduationCap,
  HeartPulse,
  Home,
  Network,
  Package,
  Plus,
  ShieldCheck,
  Ticket,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { OrgUnitType } from '@toastmasters/contracts';

/** Inline affordance rendered on the right of a nav row (e.g. "+ New meeting"). */
export type NavAction = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  action?: NavAction;
  /** Rendered greyed-out and non-clickable — the sandbox's "rest of the club" items. */
  disabled?: boolean;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/** The active unit drives which tier's pages the sidebar links to. */
export type ActiveUnit = { id: string; type: OrgUnitType };

/**
 * Where a unit's section starts — the page a signed-in person is sent to
 * instead of the marketing home, so nobody has to pick a unit by hand. Null
 * for a tier with no pages of its own (`international`, `district`), which
 * leaves the home page rendering.
 */
export function unitLandingPath(unit: ActiveUnit): string | null {
  switch (unit.type) {
    case 'club':
      return `/clubs/${unit.id}/meetings`;
    case 'area':
    case 'division':
      return `/${unit.type}s/${unit.id}/dashboard`;
    case 'region':
      return `/platform/${unit.id}/dashboard`;
    default:
      return null;
  }
}

/** Where a zero-org-tree-footprint person lands — see buildNavSections' sandbox branch. */
export const SANDBOX_LANDING_PATH = '/sandbox/meetings';

/**
 * The sidebar renders from grants once we wire `can()` in — for now every
 * signed-in person sees the sub-tree matching the tier of whichever unit
 * they've selected. The `authorize()` gate on each API route is still the
 * source of truth; the sidebar just avoids linking to a page whose data-fetch
 * would 403 — which is exactly why branching on the unit's *tier* here is not
 * a permission check. A non-super-admin who somehow reached a region unit
 * still gets a 403 from `platform.console` on the fetch.
 *
 * `hasAnyUnits` distinguishes two different reasons `activeUnit` can be
 * null: an Area/Division/Region role-holder with no default club (who still
 * has units to switch to — the plain Home+Tickets fallback below), versus a
 * person with zero org-tree footprint at all — nothing to switch to,
 * because there is nothing they've ever been assigned. That second case is
 * the public sandbox-signup outcome, and gets the sandboxed Club nav
 * instead of a dead end.
 */
export function buildNavSections(
  activeUnit: ActiveUnit | null,
  hasAnyUnits: boolean,
): NavSection[] {
  const overview: NavSection = {
    label: 'Overview',
    items: [{ href: '/', label: 'Home', icon: Home }],
  };

  const crossTier: NavSection = {
    label: 'Support',
    items: [{ href: '/tickets', label: 'Tickets', icon: Ticket }],
  };

  if (!activeUnit && !hasAnyUnits) {
    const sandbox: NavSection = {
      label: 'Club (sandbox)',
      items: [
        { href: '/sandbox/meetings', label: 'Meetings', icon: CalendarDays },
        { href: '/sandbox/planner', label: 'Planner', icon: CalendarRange },
        { href: '/sandbox/guests', label: 'Guests', icon: UserPlus },
        { href: '/sandbox/membership', label: 'Membership', icon: HeartPulse },
        { href: '/sandbox/education', label: 'Education', icon: GraduationCap },
        { href: '#', label: 'Finance', icon: Wallet, disabled: true },
        { href: '#', label: 'Library', icon: BookOpen, disabled: true },
        { href: '#', label: 'Inventory', icon: Package, disabled: true },
        { href: '#', label: 'Quality', icon: ShieldCheck, disabled: true },
        { href: '#', label: 'Governance', icon: Gavel, disabled: true },
      ],
    };
    return [overview, sandbox, crossTier];
  }

  if (!activeUnit) return [overview, crossTier];

  // Region is the platform tier: the org tree roots there and only
  // system_admin is ever scoped to it, so it maps to the admin console
  // rather than to a club's pages.
  if (activeUnit.type === 'region') {
    const platform: NavSection = {
      label: 'Platform',
      items: [
        {
          href: `/platform/${activeUnit.id}/dashboard`,
          label: 'Dashboard',
          icon: ShieldCheck,
        },
        {
          href: `/platform/${activeUnit.id}/org-tree`,
          label: 'Org tree',
          icon: Network,
        },
        {
          href: `/platform/${activeUnit.id}/users`,
          label: 'Users',
          icon: Users,
        },
      ],
    };
    return [overview, platform, crossTier];
  }

  // Area and division already have their own dashboards; anything above a
  // club that isn't the region gets its oversight page, not club nav.
  if (activeUnit.type === 'area' || activeUnit.type === 'division') {
    const oversight: NavSection = {
      label: activeUnit.type === 'area' ? 'Area' : 'Division',
      items: [
        {
          href: `/${activeUnit.type}s/${activeUnit.id}/dashboard`,
          label: 'Dashboard',
          icon: ShieldCheck,
        },
      ],
    };
    return [overview, oversight, crossTier];
  }

  const clubBase = `/clubs/${activeUnit.id}`;
  const club: NavSection = {
    label: 'Club',
    items: [
      {
        href: `${clubBase}/meetings`,
        label: 'Meetings',
        icon: CalendarDays,
        action: {
          href: `${clubBase}/meetings?new=1`,
          label: 'Create meeting',
          icon: Plus,
        },
      },
      { href: `${clubBase}/planner`, label: 'Planner', icon: CalendarRange },
      { href: `${clubBase}/guests`, label: 'Guests', icon: UserPlus },
      { href: `${clubBase}/membership`, label: 'Membership', icon: HeartPulse },
      { href: `${clubBase}/finance`, label: 'Finance', icon: Wallet },
      { href: `${clubBase}/library`, label: 'Library', icon: BookOpen },
      { href: `${clubBase}/inventory`, label: 'Inventory', icon: Package },
      { href: `${clubBase}/quality`, label: 'Quality', icon: ShieldCheck },
      { href: `${clubBase}/education`, label: 'Education', icon: GraduationCap },
      { href: `${clubBase}/governance`, label: 'Governance', icon: Gavel },
    ],
  };

  return [overview, club, crossTier];
}
