'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { PersonSearchResultItem } from '@toastmasters/contracts';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

function statusVariant(
  status: PersonSearchResultItem['status'],
): 'secondary' | 'outline' | 'default' {
  if (status === 'active') return 'default';
  if (status === 'invited') return 'secondary';
  return 'outline';
}

/** "Roles / Groups" cell: club officer/member roles, platform roles, and — if none — the club memberships alone. */
function RoleBadges({ item }: { item: PersonSearchResultItem }) {
  const badges = [
    ...item.platformRoles.map((p) => ({
      key: `plat-${p.platformRoleAssignmentId}`,
      label: p.role,
    })),
    ...item.roleAssignments.map((r) => ({
      key: `role-${r.roleAssignmentId}`,
      label: `${r.role} · ${r.orgUnitName}`,
    })),
  ];
  if (badges.length === 0 && item.clubMemberships.length > 0) {
    return (
      <span className="whitespace-nowrap text-muted-foreground">
        Member · {item.clubMemberships[0]!.clubName}
      </span>
    );
  }
  if (badges.length === 0) {
    return <span className="text-muted-foreground/70">Unassigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <Badge key={b.key} variant="outline" className="whitespace-nowrap">
          {b.label}
        </Badge>
      ))}
    </div>
  );
}

export function UsersTable({
  regionUnitId,
  anchorOrgUnitId,
  initialItems,
  initialTotal,
}: {
  regionUnitId: string;
  anchorOrgUnitId: string;
  initialItems: PersonSearchResultItem[];
  initialTotal: number;
}) {
  const [query, setQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ limit: '100' });
      if (query.trim()) params.set('q', query.trim());
      if (includeDeleted) params.set('includeDeleted', 'true');
      setLoading(true);
      fetch(`/api/org-units/${anchorOrgUnitId}/people?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setItems(data.items);
            setTotal(data.total);
          }
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, includeDeleted, anchorOrgUnitId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email or TI number"
            aria-label="Search users"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) => setIncludeDeleted(event.target.checked)}
              className="size-3.5 rounded border-input"
            />
            Show disabled accounts
          </label>
          <p className="text-xs text-muted-foreground">
            {loading ? 'Searching…' : `${total} user${total === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {query ? `No match for "${query}".` : 'No users yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-muted">
                <th
                  scope="col"
                  className="sticky left-0 z-20 min-w-[9.5rem] border-r border-b border-border bg-muted px-3 py-2.5 text-left text-xs font-medium text-muted-foreground sm:min-w-[13rem] sm:px-4"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  Email
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  Phone
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  TI #
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  Roles / Groups
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-b border-border bg-background px-3 py-3 text-left font-medium group-last:border-b-0 group-hover:bg-muted sm:px-4"
                  >
                    <Link
                      href={`/platform/${regionUnitId}/users/${item.id}`}
                      className="block max-w-32 truncate text-[var(--brand)] underline-offset-2 hover:underline sm:max-w-none"
                    >
                      {item.fullName}
                    </Link>
                  </th>
                  <td className="border-b border-border px-3 py-3 whitespace-nowrap group-last:border-b-0 group-hover:bg-muted">
                    {item.email}
                  </td>
                  <td className="border-b border-border px-3 py-3 whitespace-nowrap text-muted-foreground group-last:border-b-0 group-hover:bg-muted">
                    {item.phone ?? '—'}
                  </td>
                  <td className="border-b border-border px-3 py-3 whitespace-nowrap text-muted-foreground group-last:border-b-0 group-hover:bg-muted">
                    {item.tiMemberNumber ?? '—'}
                  </td>
                  <td className="border-b border-border px-3 py-3 group-last:border-b-0 group-hover:bg-muted">
                    <RoleBadges item={item} />
                  </td>
                  <td className="border-b border-border px-3 py-3 whitespace-nowrap group-last:border-b-0 group-hover:bg-muted">
                    {item.deletedAt ? (
                      <Badge variant="destructive">deleted</Badge>
                    ) : (
                      <Badge variant={statusVariant(item.status)}>
                        {item.pendingInvitation ? 'invited' : item.status}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground sm:hidden">Swipe the table to see all columns.</p>
    </div>
  );
}
