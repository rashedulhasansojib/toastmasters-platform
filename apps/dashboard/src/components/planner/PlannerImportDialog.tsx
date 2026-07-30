'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  plannerImportResultSchema,
  type PlannerImportResult,
  type PlannerImportRow,
} from '@toastmasters/contracts';
import { CheckCircle2Icon, DownloadIcon, TriangleAlertIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';
import { PLANNER_COLUMNS, formatMeetingDate } from './columns';
import { downloadPlannerTemplate, parsePlannerCsv, type ParseOutcome } from './csv';

const ROLE_LABEL = new Map(
  PLANNER_COLUMNS.map((c) => [`${c.roleKey}:${c.slotIndex ?? 'null'}`, c.label]),
);

export function PlannerImportDialog({
  clubUnitId,
  open,
  onOpenChange,
}: {
  clubUnitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import planner"
      description="A CSV with a Date column and one column per role."
    >
      {open && <ImportForm clubUnitId={clubUnitId} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ImportForm({ clubUnitId, onDone }: { clubUnitId: string; onDone: () => void }) {
  const router = useRouter();
  /** Meetings need a time of day; the sheet only carries a date. */
  const [meetingTime, setMeetingTime] = useState('19:00');
  const [parsed, setParsed] = useState<ParseOutcome | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<PlannerImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    setParsed(parsePlannerCsv(await file.text(), meetingTime));
  }

  async function upload(rows: PlannerImportRow[]) {
    setSubmitting(true);
    try {
      const response = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/planner/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows }),
          }),
        {
          loading: 'Importing planner…',
          success: 'Planner imported',
          error: 'Import failed — nothing was saved.',
        },
      );
      if (!response) return;
      setResult(plannerImportResultSchema.parse(await response.json()));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="font-medium">Imported</p>
            <p className="text-muted-foreground">
              {result.meetingsCreated} meeting{result.meetingsCreated === 1 ? '' : 's'} scheduled,{' '}
              {result.meetingsMatched} matched, {result.assignmentsCreated} role
              {result.assignmentsCreated === 1 ? '' : 's'} assigned
              {result.assignmentsSkipped > 0 &&
                `, ${result.assignmentsSkipped} skipped (already filled)`}
              .
            </p>
          </div>
        </div>

        {/* FR-MTG-5's pending list: names the server could not place. Shown
            rather than guessed, so nothing lands silently wrong. */}
        {result.unresolved.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>
                <span className="font-medium">
                  {result.unresolved.length} name
                  {result.unresolved.length === 1 ? '' : 's'} not assigned.
                </span>{' '}
                <span className="text-muted-foreground">
                  Assign these from each meeting&apos;s roles tab.
                </span>
              </p>
            </div>
            <ul className="max-h-56 overflow-y-auto rounded-lg border divide-y text-sm">
              {result.unresolved.map((u, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatMeetingDate(u.scheduledAt)} ·{' '}
                      {ROLE_LABEL.get(`${u.roleKey}:${u.slotIndex ?? 'null'}`) ?? u.roleKey}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {u.reason === 'ambiguous' ? 'More than one match' : 'No member matched'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="planner-time">Meeting start time</Label>
        <Input
          id="planner-time"
          type="time"
          className="h-11 lg:h-9"
          value={meetingTime}
          onChange={(e) => setMeetingTime(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The sheet has dates only — this sets the time for any meeting it creates.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="planner-file">CSV file</Label>
        <Input
          id="planner-file"
          type="file"
          accept=".csv,text/csv"
          className="h-11 py-2 lg:h-9"
          onChange={(e) => void onFile(e)}
        />
      </div>

      <button
        type="button"
        onClick={downloadPlannerTemplate}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline hover:text-foreground"
      >
        <DownloadIcon className="size-3.5" />
        Download a template
      </button>

      {parsed && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {fileName} — {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} ready
          </p>
          {parsed.ignoredColumns.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ignored columns: {parsed.ignoredColumns.join(', ')}
            </p>
          )}
          {parsed.errors.length > 0 && (
            <ul className="max-h-32 overflow-y-auto text-xs text-destructive">
              {parsed.errors.map((e, i) => (
                <li key={i}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-11 lg:h-9" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 lg:h-9"
          disabled={submitting || !parsed || parsed.rows.length === 0}
          onClick={() => parsed && void upload(parsed.rows)}
        >
          {submitting ? 'Importing…' : `Import ${parsed?.rows.length ?? 0} row(s)`}
        </Button>
      </div>
    </div>
  );
}
