'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ChecklistRun } from '@toastmasters/contracts';

function RunItem({
  clubUnitId,
  meetingId,
  runId,
  item,
}: {
  clubUnitId: string;
  meetingId: string;
  runId: string;
  item: ChecklistRun['items'][number];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/checklist-runs/${runId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: item.key, done: !item.done }),
        },
      );
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="flex items-center gap-2 text-left disabled:opacity-50"
    >
      {item.done ? (
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className={item.done ? 'text-muted-foreground line-through' : undefined}>
        {item.label}
      </span>
    </button>
  );
}

export function ChecklistRunsList({
  clubUnitId,
  meetingId,
  runs,
}: {
  clubUnitId: string;
  meetingId: string;
  runs: ChecklistRun[];
}) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No checklists started for this meeting.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => {
        const doneCount = run.items.filter((item) => item.done).length;
        return (
          <Card key={run.id}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {doneCount}/{run.items.length} done
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {run.items.map((item, i) => (
                  <div key={item.key}>
                    {i > 0 && <Separator className="mb-2" />}
                    <RunItem
                      clubUnitId={clubUnitId}
                      meetingId={meetingId}
                      runId={run.id}
                      item={item}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
