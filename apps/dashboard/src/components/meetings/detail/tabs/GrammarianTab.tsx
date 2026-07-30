'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { MeetingLiveRecord, WordOfDay } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitAction } from '@/lib/toast';
import { EmptyState, Field, TabSectionHeading } from '../primitives';

type Correction = { said: string; shouldHaveBeen: string };

/**
 * Grammarian report: how often the word of the day was used, plus the
 * language corrections to read out. Saved as one `MeetingLiveRecord` with a
 * stable `clientKey`, so re-saving updates rather than duplicating.
 */
export function GrammarianTab({
  clubUnitId,
  meetingId,
  wordOfDay,
  liveRecords,
}: {
  clubUnitId: string;
  meetingId: string;
  wordOfDay: WordOfDay;
  liveRecords: MeetingLiveRecord[];
}) {
  const router = useRouter();
  const [uses, setUses] = useState(0);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [said, setSaid] = useState('');
  const [shouldHaveBeen, setShouldHaveBeen] = useState('');
  const [saving, setSaving] = useState(false);

  const savedCount = liveRecords.filter((r) => r.kind === 'grammarian').length;

  function addCorrection() {
    if (!said.trim() || !shouldHaveBeen.trim()) return;
    setCorrections((prev) => [
      ...prev,
      { said: said.trim(), shouldHaveBeen: shouldHaveBeen.trim() },
    ]);
    setSaid('');
    setShouldHaveBeen('');
  }

  async function save() {
    setSaving(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/live-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'grammarian',
              // One grammarian report per meeting, so the key is the meeting.
              clientKey: `grammarian-${meetingId}`,
              payload: { wordOfDayUses: uses, corrections },
            }),
          }),
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

  return (
    <div className="flex flex-col gap-5">
      {/* Word of the day counter */}
      <section className="flex flex-col gap-2">
        <TabSectionHeading>Word of the Day</TabSectionHeading>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-5">
          {wordOfDay.word ? (
            <div className="text-center">
              <p className="text-2xl font-bold">{wordOfDay.word}</p>
              {wordOfDay.partOfSpeech && (
                <p className="text-xs text-muted-foreground italic">{wordOfDay.partOfSpeech}</p>
              )}
              {wordOfDay.meaning && (
                <p className="mt-1 text-sm text-muted-foreground">{wordOfDay.meaning}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No word of the day set — add one on the Meeting Agenda tab.
            </p>
          )}

          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Decrease uses"
              onClick={() => setUses((n) => Math.max(0, n - 1))}
              disabled={uses === 0}
            >
              −
            </Button>
            <span className="w-16 text-center text-5xl font-black tabular-nums">{uses}</span>
            <Button
              type="button"
              size="icon-lg"
              aria-label="Increase uses"
              onClick={() => setUses((n) => n + 1)}
            >
              +
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">times used</p>
        </div>
      </section>

      {/* Corrections */}
      <section className="flex flex-col gap-2">
        <TabSectionHeading>Language Corrections</TabSectionHeading>

        {corrections.length === 0 ? (
          <EmptyState
            title="No corrections noted"
            hint="Jot down what was said and what it should have been, to read out in your report."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {corrections.map((correction, index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-destructive line-through">{correction.said}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="font-medium">{correction.shouldHaveBeen}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove correction"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setCorrections((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-end">
          <Field label="Said" htmlFor="gr-said" className="flex-1">
            <Input
              id="gr-said"
              value={said}
              onChange={(e) => setSaid(e.target.value)}
              placeholder="could of"
            />
          </Field>
          <Field label="Should have been" htmlFor="gr-correct" className="flex-1">
            <Input
              id="gr-correct"
              value={shouldHaveBeen}
              onChange={(e) => setShouldHaveBeen(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCorrection();
              }}
              placeholder="could have"
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={addCorrection}
            disabled={!said.trim() || !shouldHaveBeen.trim()}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Button type="button" className="w-full" onClick={save} disabled={saving}>
          <Save className="size-4" aria-hidden />
          {saving ? 'Saving…' : 'Save report to the meeting record'}
        </Button>
        {savedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Grammarian report saved to this meeting&apos;s record.
          </p>
        )}
      </div>
    </div>
  );
}
