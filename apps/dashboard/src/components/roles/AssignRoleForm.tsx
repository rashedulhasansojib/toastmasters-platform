'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingRoleKey, RoleRotationSuggestion } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MEETING_ROLE_KEYS } from './roleKeys';

type AssigneeKind = 'member' | 'cross_club' | 'unfilled';

export function AssignRoleForm({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const [roleKey, setRoleKey] = useState<MeetingRoleKey>('toastmaster');
  const [kind, setKind] = useState<AssigneeKind>('member');
  const [personId, setPersonId] = useState('');
  const [homeClubUnitId, setHomeClubUnitId] = useState('');
  const [suggestions, setSuggestions] = useState<RoleRotationSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/suggestions?roleKey=${roleKey}`,
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setSuggestions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clubUnitId, meetingId, roleKey]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const assignee =
        kind === 'member'
          ? { kind, personId }
          : kind === 'cross_club'
            ? { kind, personId, homeClubUnitId }
            : { kind };

      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey, assignee }),
      });
      if (!res.ok) {
        setError('Could not assign that role.');
        return;
      }
      setPersonId('');
      setHomeClubUnitId('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Role</Label>
          <Select value={roleKey} onValueChange={(value) => setRoleKey(value as MeetingRoleKey)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEETING_ROLE_KEYS.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label>Assignee</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as AssigneeKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="cross_club">Cross-club member</SelectItem>
              <SelectItem value="unfilled">Unfilled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {kind !== 'unfilled' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="role-person-id">Person ID</Label>
            <Input
              id="role-person-id"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              placeholder="uuid"
              className="w-64"
              required
            />
          </div>
        )}

        {kind === 'cross_club' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="role-home-club">Home club unit ID</Label>
            <Input
              id="role-home-club"
              value={homeClubUnitId}
              onChange={(e) => setHomeClubUnitId(e.target.value)}
              placeholder="uuid"
              className="w-64"
              required
            />
          </div>
        )}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Assigning…' : 'Assign'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>Suggestions for {MEETING_ROLE_KEYS.find((r) => r.value === roleKey)?.label}:</span>
          <ul className="flex flex-col gap-0.5">
            {suggestions.map((s) => (
              <li key={s.personId}>
                {s.fullName} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
