'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Legacy TimerReportTab's default prepared-speech flag times — the only category this simplified port ships (system-design.md's per-category thresholds are a later refinement, not needed to prove the write path). */
const GREEN_MS = 5 * 60_000;
const YELLOW_MS = 6 * 60_000;
const RED_MS = 7 * 60_000;

function signalFor(elapsedMs: number): 'green' | 'yellow' | 'red' | null {
  if (elapsedMs < GREEN_MS) return null;
  if (elapsedMs < YELLOW_MS) return 'green';
  if (elapsedMs < RED_MS) return 'yellow';
  return 'red';
}

function format(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function TimerTool({ clubUnitId, meetingId }: { clubUnitId: string; meetingId: string }) {
  const router = useRouter();
  const [category, setCategory] = useState('Prepared speech');
  const [targetLabel, setTargetLabel] = useState('');
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const clientKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedMs((prev) => prev + (Date.now() - startedAtRef.current!));
        startedAtRef.current = Date.now();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  function start() {
    startedAtRef.current = Date.now();
    if (!clientKeyRef.current) clientKeyRef.current = crypto.randomUUID();
    setRunning(true);
  }

  function pause() {
    if (startedAtRef.current !== null) {
      setElapsedMs((prev) => prev + (Date.now() - startedAtRef.current!));
    }
    startedAtRef.current = null;
    setRunning(false);
  }

  function reset() {
    startedAtRef.current = null;
    clientKeyRef.current = null;
    setRunning(false);
    setElapsedMs(0);
  }

  async function record() {
    if (!clientKeyRef.current) clientKeyRef.current = crypto.randomUUID();
    setRecording(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/live-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'timer',
          clientKey: clientKeyRef.current,
          ...(targetLabel ? { targetLabel } : {}),
          payload: { category, elapsedMs, signal: signalFor(elapsedMs) },
        }),
      });
      if (!res.ok) {
        setError('Could not record this timing — will retry with the same key on next attempt.');
        return;
      }
      router.refresh();
    } finally {
      setRecording(false);
    }
  }

  const signal = signalFor(elapsedMs);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="timer-category">Category</Label>
          <Input
            id="timer-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="timer-target">Speaker / target</Label>
          <Input
            id="timer-target"
            value={targetLabel}
            onChange={(e) => setTargetLabel(e.target.value)}
            placeholder="Jordan"
            className="w-48"
          />
        </div>
      </div>

      <div
        className={cn(
          'font-mono text-6xl font-bold tabular-nums',
          signal === 'green' && 'text-green-600 dark:text-green-500',
          signal === 'yellow' && 'text-yellow-600 dark:text-yellow-500',
          signal === 'red' && 'text-destructive',
        )}
      >
        {format(elapsedMs)}
      </div>

      <div className="flex flex-wrap gap-2">
        {!running ? (
          <Button type="button" onClick={start}>
            {elapsedMs > 0 ? 'Resume' : 'Start'}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={pause}>
            Pause
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={reset}>
          Reset
        </Button>
        <Button type="button" variant="outline" disabled={recording} onClick={record}>
          {recording ? 'Recording…' : 'Record time'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
