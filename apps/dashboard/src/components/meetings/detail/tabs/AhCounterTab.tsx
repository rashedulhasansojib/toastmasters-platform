'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Save, Trash2, X } from 'lucide-react';
import type { MeetingLiveRecord, MeetingRoleAssignment } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { submitAction } from '@/lib/toast';
import { MemberCombobox } from '../MemberCombobox';
import { useMemberName } from '../MembersContext';
import { EmptyState, TabSectionHeading } from '../primitives';
import { latestByTarget, newAttemptKey } from '../liveRecords';

const DEFAULT_FILLER_WORDS = ['Ah', 'Um', 'So', 'Like'];
const MAX_WORDS = 20;

type CountedSpeaker = {
  /** Stable identity of the speaker being counted; also the record's `targetKey`. */
  id: string;
  name: string;
  counts: Record<string, number>;
};

type SavedCount = { word: string; count: number };

/** Saved payloads are `Record<string, unknown>` on the wire — narrow defensively. */
function readCounts(payload: MeetingLiveRecord['payload']): SavedCount[] {
  const counts = (payload as { counts?: unknown }).counts;
  if (!Array.isArray(counts)) return [];
  return counts.filter(
    (c): c is SavedCount =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as SavedCount).word === 'string' &&
      typeof (c as SavedCount).count === 'number',
  );
}

/**
 * Ah-Counter tally.
 *
 * Counting happens locally so a tap is instant even on venue wifi; the whole
 * tally is then written as one `MeetingLiveRecord` per speaker under a stable
 * `targetKey`. Saving again writes a new row that supersedes the previous one
 * on read — the table is append-only (NFR-4) — and the tab opens on the last
 * saved tally rather than on zeroes.
 */
export function AhCounterTab({
  clubUnitId,
  meetingId,
  roleAssignments,
  liveRecords,
}: {
  clubUnitId: string;
  meetingId: string;
  roleAssignments: MeetingRoleAssignment[];
  liveRecords: MeetingLiveRecord[];
}) {
  const router = useRouter();
  const memberName = useMemberName();

  /** The current saved tally per speaker, newest revision only. */
  const savedByTarget = useMemo(() => latestByTarget(liveRecords, 'ah_counter'), [liveRecords]);

  // A word that was counted last time has to stay on the pad, or its saved
  // count would be invisible and dropped by the next save.
  const [fillerWords, setFillerWords] = useState<string[]>(() => {
    const words = [...DEFAULT_FILLER_WORDS];
    for (const record of savedByTarget.values()) {
      for (const { word } of readCounts(record.payload)) {
        if (!words.some((w) => w.toLowerCase() === word.toLowerCase())) words.push(word);
      }
    }
    return words.slice(0, MAX_WORDS);
  });
  const [addingWord, setAddingWord] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [adding, setAdding] = useState(false);
  const [newPersonId, setNewPersonId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  /** Seed one row per person on the agenda — speakers and evaluators alike. */
  const seeded = useMemo<CountedSpeaker[]>(
    () =>
      roleAssignments
        .filter(
          (a) =>
            a.status !== 'declined' &&
            (a.assignee.kind === 'member' || a.assignee.kind === 'cross_club') &&
            (a.roleKey === 'speaker' || a.roleKey === 'evaluator'),
        )
        .map((a) => ({
          id: `role-${a.id}`,
          name: memberName(
            a.assignee.kind === 'member' || a.assignee.kind === 'cross_club'
              ? a.assignee.personId
              : null,
          ),
          counts: {},
        })),
    [roleAssignments, memberName],
  );

  /**
   * Counts are held as an id-keyed overlay on top of the derived `seeded`
   * list, so a change to the agenda re-derives the roster during render
   * without an effect copying props into state — and without a tally that
   * is already part-way entered being reset. Seeded from the last saved
   * tally so a reopened tab shows what is on the record.
   */
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const [targetKey, record] of savedByTarget) {
      out[targetKey] = Object.fromEntries(readCounts(record.payload).map((c) => [c.word, c.count]));
    }
    return out;
  });

  // Manually-added speakers only exist in the saved records, so rebuild them
  // from there — their ids are minted client-side and would not survive a
  // reload otherwise. `ah-manual-` matches rows written before targetKey
  // existed, whose key was backfilled from the old clientKey.
  const [manual, setManual] = useState<CountedSpeaker[]>(() =>
    [...savedByTarget.entries()]
      .filter(([targetKey]) => /^(ah-)?manual-/.test(targetKey))
      .map(([targetKey, record]) => ({
        id: targetKey,
        name: record.targetLabel ?? '',
        counts: {},
      })),
  );

  const speakers = useMemo<CountedSpeaker[]>(
    () =>
      [...seeded, ...manual].map((speaker) => ({
        ...speaker,
        counts: counts[speaker.id] ?? {},
      })),
    [seeded, manual, counts],
  );

  // `openIds` starts empty, which we read as "open everything" so a fresh
  // tab shows every tally without an effect seeding the set.
  const allOpen = openIds.size === 0;
  const isOpen = (id: string) => allOpen || openIds.has(id);

  function adjust(speakerId: string, word: string, delta: number) {
    setCounts((prev) => {
      const speakerCounts = prev[speakerId] ?? {};
      return {
        ...prev,
        [speakerId]: {
          ...speakerCounts,
          [word]: Math.max(0, (speakerCounts[word] ?? 0) + delta),
        },
      };
    });
  }

  function addWord() {
    const word = newWord.trim();
    if (!word || fillerWords.some((w) => w.toLowerCase() === word.toLowerCase())) {
      setNewWord('');
      setAddingWord(false);
      return;
    }
    setFillerWords((prev) => [...prev, word]);
    setNewWord('');
    setAddingWord(false);
  }

  function removeWord(word: string) {
    setFillerWords((prev) => prev.filter((w) => w !== word));
  }

  function addSpeaker() {
    const name = newPersonId ? memberName(newPersonId) : newName.trim();
    if (!name) return;
    const id = `manual-${crypto.randomUUID()}`;
    setManual((prev) => [...prev, { id, name, counts: {} }]);
    setOpenIds((prev) =>
      prev.size === 0 ? new Set(speakers.map((s) => s.id)).add(id) : new Set(prev).add(id),
    );
    setNewPersonId(null);
    setNewName('');
    setAdding(false);
  }

  function removeSpeaker(id: string) {
    if (id.startsWith('manual-')) setManual((prev) => prev.filter((s) => s.id !== id));
    else setCounts((prev) => ({ ...prev, [id]: {} }));
  }

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = prev.size === 0 ? new Set(speakers.map((s) => s.id)) : new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalFor = (speaker: CountedSpeaker) =>
    Object.values(speaker.counts).reduce((sum, n) => sum + n, 0);

  /**
   * What actually gets written for a speaker: every word with a count above
   * zero, read straight off the tally.
   *
   * Deliberately NOT `fillerWords.map(...)`. That version only saved words
   * still on the pad, so removing a word after counting it — or a tally
   * rehydrated under a word the pad no longer showed — silently produced an
   * empty list. `saveReport` then skipped that speaker while `anyCounted`,
   * which reads the tally directly, still showed the Save button. Every
   * speaker got skipped, the loop reported success, and nothing was stored.
   */
  const countsToSave = (speaker: CountedSpeaker) =>
    Object.entries(speaker.counts)
      .filter(([word, count]) => word.trim().length > 0 && count > 0)
      .map(([word, count]) => ({ word, count }));

  /**
   * One record per speaker, keyed by the speaker (`targetKey`) and stamped
   * with a fresh attempt key, so re-saving a corrected tally supersedes the
   * earlier one instead of being swallowed as a duplicate.
   */
  async function saveReport() {
    setSaving(true);
    try {
      const result = await submitAction(
        async () => {
          let written = 0;
          for (const speaker of speakers) {
            const counts = countsToSave(speaker);
            if (counts.length === 0) continue;
            const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/live-records`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                kind: 'ah_counter',
                targetKey: speaker.id,
                clientKey: newAttemptKey(speaker.id),
                targetLabel: speaker.name.trim() || undefined,
                payload: { counts },
              }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as {
                detail?: string;
                message?: string;
              };
              throw new Error(
                body.detail ?? body.message ?? 'Could not save the report — press Save to retry.',
              );
            }
            written += 1;
          }
          // Never report success for a no-op: that is what hid this bug.
          if (written === 0)
            throw new Error('Nothing to save yet — count at least one word first.');
          return true;
        },
        {
          loading: 'Saving report…',
          success: 'Report saved',
          error: 'Could not save the report — press Save again to retry.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const savedCount = liveRecords.filter((r) => r.kind === 'ah_counter').length;
  const anyCounted = speakers.some((s) => totalFor(s) > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Filler words */}
      <section className="flex flex-col gap-2">
        <TabSectionHeading>Filler Words</TabSectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          {fillerWords.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium"
            >
              {word}
              <button
                type="button"
                onClick={() => removeWord(word)}
                aria-label={`Remove ${word}`}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}

          {addingWord ? (
            <span className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addWord();
                  if (e.key === 'Escape') {
                    setAddingWord(false);
                    setNewWord('');
                  }
                }}
                placeholder="Word…"
                className="h-8 w-28"
              />
              <Button type="button" size="sm" onClick={addWord} disabled={!newWord.trim()}>
                Add
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Cancel"
                onClick={() => {
                  setAddingWord(false);
                  setNewWord('');
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </span>
          ) : (
            fillerWords.length < MAX_WORDS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setAddingWord(true)}
              >
                <Plus className="size-3.5" aria-hidden />
                Add word
              </Button>
            )
          )}
        </div>
      </section>

      {/* Counts */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <TabSectionHeading>Counts</TabSectionHeading>
          {!adding && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" aria-hidden />
              Add speaker
            </Button>
          )}
        </div>

        {adding && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
            <MemberCombobox
              value={newPersonId}
              onChange={setNewPersonId}
              placeholder="Pick a member…"
            />
            {!newPersonId && (
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="…or type a name (guest, visitor)"
              />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                onClick={addSpeaker}
                disabled={!newPersonId && !newName.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewPersonId(null);
                  setNewName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {speakers.length === 0 && !adding ? (
          <EmptyState
            title="No speakers yet"
            hint="Speakers and evaluators from the agenda appear here automatically, or add one manually."
          />
        ) : (
          speakers.map((speaker) => (
            <SpeakerAccordion
              key={speaker.id}
              speaker={speaker}
              fillerWords={fillerWords}
              total={totalFor(speaker)}
              open={isOpen(speaker.id)}
              onToggle={() => toggleOpen(speaker.id)}
              onAdjust={(word, delta) => adjust(speaker.id, word, delta)}
              onDelete={() => removeSpeaker(speaker.id)}
            />
          ))
        )}
      </section>

      {/* Summary + save */}
      {anyCounted && (
        <section className="flex flex-col gap-2">
          <TabSectionHeading>Summary</TabSectionHeading>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="py-2.5 pr-2 pl-4 text-left text-xs font-semibold">Speaker</th>
                  {fillerWords.map((word) => (
                    <th key={word} className="px-2 py-2.5 text-center text-xs font-semibold">
                      {word}
                    </th>
                  ))}
                  <th className="py-2.5 pr-4 pl-2 text-right text-xs font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {speakers.map((speaker) => (
                  <tr key={speaker.id} className="hover:bg-muted/20">
                    <td className="py-2.5 pr-2 pl-4 font-medium">{speaker.name}</td>
                    {fillerWords.map((word) => {
                      const n = speaker.counts[word] ?? 0;
                      return (
                        <td key={word} className="px-2 py-2.5 text-center font-mono tabular-nums">
                          {n > 0 ? n : <span className="text-muted-foreground/40">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-2.5 pr-4 pl-2 text-right font-bold">
                      {totalFor(speaker) || <span className="text-muted-foreground/40">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button type="button" className="w-full" onClick={saveReport} disabled={saving}>
            <Save className="size-4" aria-hidden />
            {saving ? 'Saving…' : 'Save report to the meeting record'}
          </Button>
          {savedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {savedCount} ah-counter record{savedCount === 1 ? '' : 's'} saved.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function SpeakerAccordion({
  speaker,
  fillerWords,
  total,
  open,
  onToggle,
  onAdjust,
  onDelete,
}: {
  speaker: CountedSpeaker;
  fillerWords: string[];
  total: number;
  open: boolean;
  onToggle: () => void;
  onAdjust: (word: string, delta: number) => void;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden
          />
          <span className="flex-1 truncate text-sm font-semibold">{speaker.name || '—'}</span>
          {total > 0 && (
            <span className="shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
              {total} total
            </span>
          )}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${speaker.name}`}
          className="text-muted-foreground/50 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>

      {open && (
        <div className="border-t border-border">
          <div
            className={cn(
              'grid divide-x divide-y divide-border border-border',
              fillerWords.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4',
            )}
          >
            {fillerWords.map((word) => {
              const count = speaker.counts[word] ?? 0;
              return (
                <div key={word} className="flex flex-col items-center gap-1 p-4">
                  <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    {word}
                  </span>
                  <span className="py-1 text-4xl leading-none font-black tabular-nums">
                    {count}
                  </span>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onAdjust(word, -1)}
                      disabled={count === 0}
                      aria-label={`Decrease ${word} for ${speaker.name}`}
                      className="flex size-9 items-center justify-center rounded-full border border-border text-lg font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdjust(word, 1)}
                      aria-label={`Increase ${word} for ${speaker.name}`}
                      className="flex size-9 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
