'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_WORDS = ['Ah', 'Um', 'So', 'Like'];

export function AhCounterTool({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const [targetLabel, setTargetLabel] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEFAULT_WORDS.map((word) => [word, 0])),
  );
  const [newWord, setNewWord] = useState('');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function bump(word: string, delta: number) {
    setCounts((prev) => ({ ...prev, [word]: Math.max(0, (prev[word] ?? 0) + delta) }));
  }

  function addWord() {
    const word = newWord.trim();
    if (!word || word in counts) return;
    setCounts((prev) => ({ ...prev, [word]: 0 }));
    setNewWord('');
  }

  async function record() {
    setRecording(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/live-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'ah_counter',
          clientKey: crypto.randomUUID(),
          ...(targetLabel ? { targetLabel } : {}),
          payload: {
            counts: Object.entries(counts).map(([word, count]) => ({ word, count })),
          },
        }),
      });
      if (!res.ok) {
        setError('Could not record this report.');
        return;
      }
      router.refresh();
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="ah-target">Speaker / target</Label>
        <Input
          id="ah-target"
          value={targetLabel}
          onChange={(e) => setTargetLabel(e.target.value)}
          placeholder="Jordan"
          className="w-48"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(counts).map(([word, count]) => (
          <div key={word} className="flex flex-col items-center gap-1 rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">{word}</span>
            <span className="text-4xl font-black tabular-nums">{count}</span>
            <div className="flex gap-1">
              <Button type="button" size="icon-sm" variant="outline" onClick={() => bump(word, -1)}>
                −
              </Button>
              <Button type="button" size="icon-sm" variant="outline" onClick={() => bump(word, 1)}>
                +
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ah-new-word">Add word</Label>
          <Input
            id="ah-new-word"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            className="w-32"
          />
        </div>
        <Button type="button" variant="outline" onClick={addWord}>
          Add
        </Button>
      </div>

      <div>
        <Button type="button" disabled={recording} onClick={record}>
          {recording ? 'Recording…' : 'Record report'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
