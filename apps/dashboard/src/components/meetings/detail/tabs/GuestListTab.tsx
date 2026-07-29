'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Trash2, UserPlus, Users } from 'lucide-react';
import type { MeetingGuest, Guest } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IssueGuestLinkCard } from '@/components/guest/IssueGuestLinkCard';
import { Section } from '../primitives';

type Mode = 'idle' | 'pool' | 'manual';

export function GuestListTab({
  clubUnitId,
  meetingId,
  guests,
  clubGuests,
}: {
  clubUnitId: string;
  meetingId: string;
  /** This meeting's guest list. */
  guests: MeetingGuest[];
  /** The club's guest pipeline, to link a meeting guest to an existing record. */
  clubGuests: Guest[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [poolSelection, setPoolSelection] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const linkedGuestIds = useMemo(
    () => new Set(guests.map((g) => g.guestId).filter(Boolean) as string[]),
    [guests],
  );
  const availableGuests = useMemo(
    () => clubGuests.filter((g) => !linkedGuestIds.has(g.id)),
    [clubGuests, linkedGuestIds],
  );

  const presentCount = guests.filter((g) => g.present).length;

  function resetForm() {
    setPoolSelection('');
    setFullName('');
    setEmail('');
    setPhone('');
    setNotes('');
    setError(null);
  }

  async function submitCreate(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/guests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setError('Could not add guest');
      return;
    }
    resetForm();
    setMode('idle');
    startTransition(() => router.refresh());
  }

  function onAddFromPool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const p = availableGuests.find((x) => x.id === poolSelection);
    if (!p) {
      setError('Pick a guest');
      return;
    }
    void submitCreate({
      guestId: p.id,
      fullName: p.fullName,
      ...(p.email ? { email: p.email } : {}),
      ...(p.phone ? { phone: p.phone } : {}),
    });
  }

  function onAddManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fullName.trim();
    if (!name) {
      setError('Name is required');
      return;
    }
    void submitCreate({
      fullName: name,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  }

  function togglePresent(g: MeetingGuest) {
    startTransition(async () => {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/guests/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ present: !g.present }),
      });
      if (res.ok) router.refresh();
    });
  }

  function remove(g: MeetingGuest) {
    startTransition(async () => {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/guests/${g.id}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Guest List</h3>
          <p className="text-xs text-muted-foreground">
            {guests.length} total · {presentCount} present
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'pool' ? 'default' : 'outline'}
            onClick={() => {
              resetForm();
              setMode(mode === 'pool' ? 'idle' : 'pool');
            }}
            disabled={isPending}
            className="gap-2"
          >
            <Users className="size-4" />
            From Pool
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'manual' ? 'default' : 'outline'}
            onClick={() => {
              resetForm();
              setMode(mode === 'manual' ? 'idle' : 'manual');
            }}
            disabled={isPending}
            className="gap-2"
          >
            <UserPlus className="size-4" />
            Add Manually
          </Button>
        </div>
      </div>

      {mode === 'pool' && (
        <form
          onSubmit={onAddFromPool}
          className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3"
        >
          <Label htmlFor="mg-pool" className="text-xs text-muted-foreground">
            Pick a guest from the pool
          </Label>
          {availableGuests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unattached guests — every guest is already on this guest list.
            </p>
          ) : (
            <select
              id="mg-pool"
              value={poolSelection}
              onChange={(e) => setPoolSelection(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose a guest…</option>
              {availableGuests.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                  {p.email ? ` — ${p.email}` : ''}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || availableGuests.length === 0 || !poolSelection}
            >
              Add to list
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                resetForm();
                setMode('idle');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === 'manual' && (
        <form
          onSubmit={onAddManual}
          className="grid grid-cols-1 gap-3 rounded-md border border-dashed border-border p-3 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="mg-name" className="text-xs text-muted-foreground">
              Full name
            </Label>
            <Input
              id="mg-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jamie Guest"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mg-email" className="text-xs text-muted-foreground">
              Email (optional)
            </Label>
            <Input
              id="mg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jamie@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mg-phone" className="text-xs text-muted-foreground">
              Phone (optional)
            </Label>
            <Input
              id="mg-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8801XXXXXXX"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="mg-notes" className="text-xs text-muted-foreground">
              Notes (optional)
            </Label>
            <Textarea
              id="mg-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="How they heard about the club, referrer, etc."
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={isPending || !fullName.trim()}>
              Add guest
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                resetForm();
                setMode('idle');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {guests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No guests yet. Add from the guest pool or manually.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {guests.map((g) => (
            <li
              key={g.id}
              className={`rounded-lg border p-3 transition-colors ${
                g.present ? 'border-border' : 'border-border bg-muted/40 opacity-70'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => togglePresent(g)}
                  disabled={isPending}
                  aria-label={g.present ? 'Mark as absent' : 'Mark as present'}
                  className={
                    g.present
                      ? 'text-green-600 hover:text-green-700'
                      : 'text-muted-foreground hover:text-green-600'
                  }
                >
                  {g.present ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{g.fullName}</span>
                    {g.guestId && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        from pool
                      </span>
                    )}
                    {!g.present && (
                      <span className="text-[10px] uppercase text-muted-foreground">Absent</span>
                    )}
                  </div>
                  {(g.email || g.phone) && (
                    <div className="text-xs text-muted-foreground">
                      {g.email}
                      {g.email && g.phone ? ' · ' : ''}
                      {g.phone}
                    </div>
                  )}
                  {g.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {g.notes}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(g)}
                  disabled={isPending}
                  aria-label="Remove guest"
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Capability-token links: a guest registers without an account
          (FR-MEM-4). Collapsed by default — it is issue-once, not a list. */}
      <Section title="Guest self-registration links" defaultOpen={false}>
        <IssueGuestLinkCard clubUnitId={clubUnitId} meetingId={meetingId} />
      </Section>
    </section>
  );
}
