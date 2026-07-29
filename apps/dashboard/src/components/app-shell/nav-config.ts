import {
  BookOpen,
  CalendarDays,
  Gavel,
  GraduationCap,
  Home,
  Package,
  Plus,
  ShieldCheck,
  Ticket,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

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
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * The sidebar renders from grants once we wire `can()` in — for now every
 * signed-in person sees the club sub-tree of whichever unit they've selected.
 * The `authorize()` gate on each API route is still the source of truth; the
 * sidebar just avoids linking to a page whose data-fetch would 403.
 */
export function buildNavSections(activeUnitId: string | null): NavSection[] {
  const overview: NavSection = {
    label: 'Overview',
    items: [{ href: '/', label: 'Home', icon: Home }],
  };

  const crossTier: NavSection = {
    label: 'Support',
    items: [{ href: '/tickets', label: 'Tickets', icon: Ticket }],
  };

  if (!activeUnitId) return [overview, crossTier];

  const clubBase = `/clubs/${activeUnitId}`;
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
      { href: `${clubBase}/prospects`, label: 'Prospects', icon: UserPlus },
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
