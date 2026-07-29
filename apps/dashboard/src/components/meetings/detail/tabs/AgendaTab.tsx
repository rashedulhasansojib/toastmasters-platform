'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import type {
  Meeting,
  MeetingRoleAssignment,
  MeetingRoleKey,
  PathwayPath,
  SpeechSlot,
} from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AGENDA_ROLE_KEYS, MEETING_ROLE_KEYS } from '@/components/roles/roleKeys';
import { MemberCombobox } from '../MemberCombobox';
import { Field, Section } from '../primitives';
import { PreparedSpeakers } from './PreparedSpeakers';
import type { MeetingDraft } from '../useMeetingDraft';

const ROLE_LABEL = new Map(MEETING_ROLE_KEYS.map((r) => [r.value, r.label]));

export function AgendaTab({
  clubUnitId,
  meeting,
  draft,
  update,
  roleAssignments,
  speechSlots,
  pathways,
}: {
  clubUnitId: string;
  meeting: Meeting;
  draft: MeetingDraft;
  update: (patch: Partial<MeetingDraft>, immediate?: boolean) => void;
  roleAssignments: MeetingRoleAssignment[];
  speechSlots: SpeechSlot[];
  pathways: PathwayPath[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const base = `/api/clubs/${clubUnitId}/meetings/${meeting.id}`;

  /**
   * The officer roles render as a fixed grid, so each cell needs the single
   * live assignment for that key. Declined ones are skipped — a declined
   * assignment means the seat is open again.
   */
  function assignmentFor(roleKey: MeetingRoleKey): MeetingRoleAssignment | null {
    return roleAssignments.find((a) => a.roleKey === roleKey && a.status !== 'declined') ?? null;
  }

  /**
   * Reassigning a role: withdraw the outstanding proposal, then propose the
   * new person. An assignment the assignee has already answered can't be
   * withdrawn (409 from the API), so the UI says so rather than silently
   * doing nothing.
   */
  function setRole(roleKey: MeetingRoleKey, personId: string | null) {
    const existing = assignmentFor(roleKey);
    startTransition(async () => {
      setError(null);
      if (existing) {
        if (existing.status !== 'proposed') {
          setError(
            `${ROLE_LABEL.get(roleKey)} is already ${existing.status}. Ask them to decline before reassigning.`,
          );
          return;
        }
        const del = await fetch(`${base}/role-assignments/${existing.id}`, { method: 'DELETE' });
        if (!del.ok && del.status !== 204) {
          setError('Could not withdraw the current assignment.');
          return;
        }
      }
      if (personId) {
        const res = await fetch(`${base}/role-assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleKey, assignee: { kind: 'member', personId } }),
        });
        if (!res.ok) {
          setError('Could not assign that role.');
          return;
        }
      }
      router.refresh();
    });
  }

  function setAssignmentStatus(id: string, status: 'confirmed' | 'declined') {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`${base}/role-assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          status === 'declined' ? { status, declinedReason: 'Withdrew from the role' } : { status },
        ),
      });
      if (!res.ok) {
        setError('Could not update that assignment.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* ── Meeting details ─────────────────────────────────────────── */}
      <Section title="Meeting Details">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Meeting Number" htmlFor="md-number">
            <Input
              id="md-number"
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.meetingNumber}
              onChange={(e) => update({ meetingNumber: e.target.value })}
              placeholder="40"
            />
          </Field>
          <Field label="Date" htmlFor="md-date">
            <Input
              id="md-date"
              type="date"
              value={draft.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </Field>
          <Field label="Start Time" htmlFor="md-time">
            <Input
              id="md-time"
              type="time"
              value={draft.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
            />
          </Field>
          <Field label="Theme of the Day" htmlFor="md-theme" className="col-span-2 sm:col-span-3">
            <Input
              id="md-theme"
              value={draft.theme}
              onChange={(e) => update({ theme: e.target.value })}
              placeholder="Expectations vs Reality"
            />
          </Field>
          <Field label="Venue (optional)" htmlFor="md-venue" className="col-span-2">
            <Input
              id="md-venue"
              value={draft.venue}
              onChange={(e) => update({ venue: e.target.value })}
              placeholder="Room 101 / Zoom"
            />
          </Field>
          <Field label="Label (optional)" htmlFor="md-title">
            <Input
              id="md-title"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Internal label"
            />
          </Field>
          <Field
            label="Registration Link (optional)"
            htmlFor="md-join"
            className="col-span-2 sm:col-span-3"
          >
            <Input
              id="md-join"
              value={draft.joinUrl}
              onChange={(e) => update({ joinUrl: e.target.value })}
              placeholder="https://forms.gle/…"
            />
          </Field>
        </div>
      </Section>

      {/* ── Role assignments ────────────────────────────────────────── */}
      <Section title="Role Assignments">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AGENDA_ROLE_KEYS.map((roleKey) => {
            const assignment = assignmentFor(roleKey);
            const personId =
              assignment && assignment.assignee.kind !== 'unfilled'
                ? assignment.assignee.personId
                : null;
            return (
              <Field key={roleKey} label={ROLE_LABEL.get(roleKey) ?? roleKey}>
                <MemberCombobox
                  value={personId}
                  onChange={(next) => setRole(roleKey, next)}
                  disabled={isPending}
                />
                {assignment && assignment.status !== 'proposed' && (
                  <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
                    {assignment.status}
                  </Badge>
                )}
                {assignment?.status === 'proposed' && (
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={isPending}
                      onClick={() => setAssignmentStatus(assignment.id, 'confirmed')}
                    >
                      <Check className="size-3" aria-hidden />
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={isPending}
                      onClick={() => setAssignmentStatus(assignment.id, 'declined')}
                    >
                      <X className="size-3" aria-hidden />
                      Decline
                    </Button>
                  </div>
                )}
              </Field>
            );
          })}
        </div>
      </Section>

      {/* ── Prepared speakers ───────────────────────────────────────── */}
      <Section title="Prepared Speakers">
        <PreparedSpeakers base={base} slots={speechSlots} pathways={pathways} />
      </Section>

      {/* ── Word of the day ─────────────────────────────────────────── */}
      <Section title="Word of the Day">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Word" htmlFor="wod-word">
            <Input
              id="wod-word"
              value={draft.wordOfDay.word}
              onChange={(e) => update({ wordOfDay: { ...draft.wordOfDay, word: e.target.value } })}
              placeholder="Connect"
            />
          </Field>
          <Field label="Part of Speech" htmlFor="wod-pos">
            <Input
              id="wod-pos"
              value={draft.wordOfDay.partOfSpeech}
              onChange={(e) =>
                update({ wordOfDay: { ...draft.wordOfDay, partOfSpeech: e.target.value } })
              }
              placeholder="Verb"
            />
          </Field>
          <Field label="Meaning" htmlFor="wod-meaning" className="col-span-2">
            <Textarea
              id="wod-meaning"
              value={draft.wordOfDay.meaning}
              onChange={(e) =>
                update({ wordOfDay: { ...draft.wordOfDay, meaning: e.target.value } })
              }
              placeholder="Definition of the word…"
              className="min-h-16 resize-none"
            />
          </Field>
          <Field label="Example Sentence" htmlFor="wod-example" className="col-span-2">
            <Textarea
              id="wod-example"
              value={draft.wordOfDay.example}
              onChange={(e) =>
                update({ wordOfDay: { ...draft.wordOfDay, example: e.target.value } })
              }
              placeholder="Use the word in a sentence…"
              className="min-h-16 resize-none"
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}
