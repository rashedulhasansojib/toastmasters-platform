import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { MeetingLiveRecord } from '@toastmasters/contracts';

function summarize(record: MeetingLiveRecord): string {
  const payload = record.payload as Record<string, unknown>;
  switch (record.kind) {
    case 'timer': {
      const ms = typeof payload.elapsedMs === 'number' ? payload.elapsedMs : 0;
      const seconds = Math.floor(ms / 1000) % 60;
      const minutes = Math.floor(ms / 60000);
      return `${payload.category ?? 'timer'} — ${minutes}:${String(seconds).padStart(2, '0')}${payload.signal ? ` (${payload.signal})` : ''}`;
    }
    case 'ah_counter': {
      const counts = Array.isArray(payload.counts) ? payload.counts : [];
      return (
        counts.map((c: { word: string; count: number }) => `${c.word}: ${c.count}`).join(', ') ||
        'no fillers'
      );
    }
    case 'grammarian': {
      const corrections = Array.isArray(payload.corrections) ? payload.corrections.length : 0;
      return `word of the day × ${payload.wordOfDayUses ?? 0}, ${corrections} correction(s)`;
    }
  }
}

export function LiveRecordsList({ records }: { records: MeetingLiveRecord[] }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">No live records yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {records.map((record, i) => (
          <div key={record.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{record.kind}</span>
                {record.targetLabel && (
                  <span className="ml-2 text-sm text-muted-foreground">{record.targetLabel}</span>
                )}
                <p className="text-sm text-muted-foreground">{summarize(record)}</p>
              </div>
              <span className="text-sm text-muted-foreground">
                {new Date(record.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
