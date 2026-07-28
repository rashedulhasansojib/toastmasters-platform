'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Correction = { said: string; shouldHaveBeen: string };

export function GrammarianTool({
  clubUnitId,
  meetingId,
}: {
  clubUnitId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const [wordOfDayUses, setWordOfDayUses] = useState(0);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [said, setSaid] = useState('');
  const [shouldHaveBeen, setShouldHaveBeen] = useState('');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCorrection() {
    if (!said.trim() || !shouldHaveBeen.trim()) return;
    setCorrections((prev) => [...prev, { said, shouldHaveBeen }]);
    setSaid('');
    setShouldHaveBeen('');
  }

  async function record() {
    setRecording(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/live-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'grammarian',
          clientKey: crypto.randomUUID(),
          payload: { wordOfDayUses, corrections },
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
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Word of the day uses</span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={() => setWordOfDayUses((n) => Math.max(0, n - 1))}
        >
          −
        </Button>
        <span className="w-8 text-center text-2xl font-bold tabular-nums">{wordOfDayUses}</span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          onClick={() => setWordOfDayUses((n) => n + 1)}
        >
          +
        </Button>
      </div>

      {corrections.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {corrections.map((c, i) => (
            <li key={i} className="text-muted-foreground">
              &ldquo;{c.said}&rdquo; → &ldquo;{c.shouldHaveBeen}&rdquo;
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="grammarian-said">Said</Label>
          <Input id="grammarian-said" value={said} onChange={(e) => setSaid(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="grammarian-correct">Should have been</Label>
          <Input
            id="grammarian-correct"
            value={shouldHaveBeen}
            onChange={(e) => setShouldHaveBeen(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={addCorrection}>
          Add correction
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
