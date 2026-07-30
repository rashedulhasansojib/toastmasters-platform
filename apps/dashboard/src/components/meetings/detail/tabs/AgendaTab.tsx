'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import type {
  AgendaItem,
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
import { submitAction, toast } from '@/lib/toast';
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
  agendaItems,
}: {
  clubUnitId: string;
  meeting: Meeting;
  draft: MeetingDraft;
  update: (patch: Partial<MeetingDraft>, immediate?: boolean) => void;
  roleAssignments: MeetingRoleAssignment[];
  speechSlots: SpeechSlot[];
  pathways: PathwayPath[];
  agendaItems: AgendaItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
    if (existing && existing.status !== 'proposed') {
      toast.error(
        `${ROLE_LABEL.get(roleKey)} is already ${existing.status}. Ask them to decline before reassigning.`,
      );
      return;
    }
    startTransition(async () => {
      const result = await submitAction(
        async () => {
          if (existing) {
            const del = await fetch(`${base}/role-assignments/${existing.id}`, {
              method: 'DELETE',
            });
            if (!del.ok && del.status !== 204) {
              throw new Error('Could not withdraw the current assignment.');
            }
          }
          if (personId) {
            const res = await fetch(`${base}/role-assignments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roleKey, assignee: { kind: 'member', personId } }),
            });
            if (!res.ok) {
              throw new Error('Could not assign that role.');
            }
          }
          return true;
        },
        {
          loading: 'Updating role…',
          success: 'Role updated',
          error: 'Could not assign that role.',
        },
      );
      if (!result) return;
      router.refresh();
    });
  }

  function setAssignmentStatus(id: string, status: 'confirmed' | 'declined') {
    startTransition(async () => {
      const result = await submitAction(
        () =>
          fetch(`${base}/role-assignments/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              status === 'declined'
                ? { status, declinedReason: 'Withdrew from the role' }
                : { status },
            ),
          }),
        {
          loading: status === 'confirmed' ? 'Confirming…' : 'Declining…',
          success: status === 'confirmed' ? 'Assignment confirmed' : 'Assignment declined',
          error: 'Could not update that assignment.',
        },
      );
      if (!result) return;
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
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
              assignment &&
              (assignment.assignee.kind === 'member' || assignment.assignee.kind === 'cross_club')
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

      {/* ── Agenda items ────────────────────────────────────────────── */}
      <Section title="Agenda Items">
        <AgendaItemsList items={agendaItems} />
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

/** mm:ss when under an hour, h:mm:ss otherwise — matches a stopwatch view. */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * The list of persisted agenda_item rows for this meeting — populated by
 * the planner's "Play" action (which appends the club's Default Toastmasters
 * Agenda template), or by any other future flow that writes to
 * `POST /agenda-items`. Empty state points back at the planner so the
 * user isn't stuck wondering how to get anything here.
 */
function AgendaItemsList({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
        No agenda items yet — press the play button on the planner row to create them from the
        club&apos;s default template.
      </p>
    );
  }
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const total = sorted.reduce((sum, i) => sum + i.plannedDurationSeconds, 0);
  return (
    <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
      {sorted.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-3 py-2">
          <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
            {item.position}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
          {item.roleKey && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {ROLE_LABEL.get(item.roleKey as MeetingRoleKey) ?? item.roleKey}
            </Badge>
          )}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatDuration(item.plannedDurationSeconds)}
          </span>
        </li>
      ))}
      <li className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>Total planned</span>
        <span className="tabular-nums">{formatDuration(total)}</span>
      </li>
    </ol>
  );
}
