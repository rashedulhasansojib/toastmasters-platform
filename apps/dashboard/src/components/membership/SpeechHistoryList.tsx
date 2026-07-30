import type { SpeechHistoryEntry } from '@toastmasters/contracts';
import { MicIcon } from 'lucide-react';

import { formatDate } from './bands';

export function SpeechHistoryList({ speeches }: { speeches: SpeechHistoryEntry[] }) {
  if (speeches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <MicIcon className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No delivered prepared speeches yet.</p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {speeches.map((speech) => (
        <li key={speech.speechSlotId} className="rounded-xl border bg-card p-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate font-medium">{speech.title}</p>
            <p className="shrink-0 text-xs text-muted-foreground">
              {formatDate(speech.meetingScheduledAt)}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {speech.pathCode} · Level {speech.level} · {speech.projectCode}
            {speech.evaluatorFullName ? ` · evaluated by ${speech.evaluatorFullName}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
