'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PlannerRow } from '@toastmasters/contracts';
import { CalendarRangeIcon, CircleAlertIcon, UploadIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlannerImportDialog } from './PlannerImportDialog';
import {
  PLANNER_COLUMNS,
  cellFor,
  cellTone,
  formatMeetingDate,
  formatMeetingDateLong,
} from './columns';

/**
 * FR-MTG-5's multi-week planner. Thirteen role columns cannot be a table on a
 * phone, so the two breakpoints show genuinely different shapes rather than
 * one shape squeezed: a real grid from `lg:` up, and one card per meeting
 * below it, where the roles become a two-column list you scroll vertically.
 *
 * Every cell links into the meeting's own roles tab. The planner is a
 * projection (system-design.md §9.2) — it shows the plan and imports into it,
 * but editing an assignment happens in the one place that owns it.
 */
export function PlannerScreen({ clubUnitId, rows }: { clubUnitId: string; rows: PlannerRow[] }) {
  const [importOpen, setImportOpen] = useState(false);

  const unfilled = rows.reduce(
    (total, row) =>
      total + PLANNER_COLUMNS.filter((c) => !cellFor(row, c.roleKey, c.slotIndex)?.personId).length,
    0,
  );

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-12 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0
              ? 'No meetings scheduled in this window'
              : `${rows.length} meeting${rows.length === 1 ? '' : 's'} · ${unfilled} role${unfilled === 1 ? '' : 's'} unfilled`}
          </p>
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => setImportOpen(true)}>
          <UploadIcon />
          <span className="hidden sm:inline">Import CSV</span>
          <span className="sm:hidden">Import</span>
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRangeIcon className="size-5 text-muted-foreground" />
          </div>
          <p className="font-medium">Nothing planned yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Import a season from a spreadsheet, or schedule meetings and assign roles from the
            meeting page.
          </p>
          <Button className="mt-5" onClick={() => setImportOpen(true)}>
            <UploadIcon />
            Import CSV
          </Button>
        </div>
      ) : (
        <>
          {/* Wide screens: the spreadsheet shape clubs already think in. */}
          <div className="hidden overflow-x-auto rounded-xl border lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2.5 text-left font-medium whitespace-nowrap">
                    Date
                  </th>
                  {PLANNER_COLUMNS.map((column) => (
                    <th
                      key={`${column.roleKey}-${column.slotIndex}`}
                      title={column.label}
                      className="px-3 py-2.5 text-left font-medium whitespace-nowrap"
                    >
                      {column.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.meetingId} className="border-b last:border-0 hover:bg-muted/30">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-background px-3 py-2.5 text-left font-medium whitespace-nowrap"
                    >
                      <Link
                        href={`/clubs/${clubUnitId}/meetings/${row.meetingId}`}
                        className="hover:underline"
                      >
                        {formatMeetingDate(row.scheduledAt)}
                      </Link>
                      {row.theme && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {row.theme}
                        </span>
                      )}
                    </th>
                    {PLANNER_COLUMNS.map((column) => {
                      const cell = cellFor(row, column.roleKey, column.slotIndex);
                      return (
                        <td
                          key={`${column.roleKey}-${column.slotIndex}`}
                          className={cn('px-3 py-2.5 whitespace-nowrap', cellTone(cell))}
                        >
                          {cell?.fullName ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per meeting. A 13-column table behind a
              horizontal scroll is unreadable on a 390px screen. */}
          <div className="flex flex-col gap-3 lg:hidden">
            {rows.map((row) => {
              const missing = PLANNER_COLUMNS.filter(
                (c) => !cellFor(row, c.roleKey, c.slotIndex)?.personId,
              ).length;
              return (
                <article key={row.meetingId} className="overflow-hidden rounded-xl border bg-card">
                  <Link
                    href={`/clubs/${clubUnitId}/meetings/${row.meetingId}`}
                    className="flex items-baseline justify-between gap-3 border-b bg-muted/30 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{formatMeetingDateLong(row.scheduledAt)}</p>
                      {row.theme && (
                        <p className="truncate text-xs text-muted-foreground">{row.theme}</p>
                      )}
                    </div>
                    {missing > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <CircleAlertIcon className="size-3.5" />
                        {missing}
                      </span>
                    )}
                  </Link>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3.5 py-3 text-sm">
                    {PLANNER_COLUMNS.map((column) => {
                      const cell = cellFor(row, column.roleKey, column.slotIndex);
                      return (
                        <div key={`${column.roleKey}-${column.slotIndex}`} className="min-w-0">
                          <dt className="truncate text-xs text-muted-foreground">{column.label}</dt>
                          <dd className={cn('truncate', cellTone(cell))}>
                            {cell?.fullName ?? 'Unfilled'}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </article>
              );
            })}
          </div>
        </>
      )}

      <PlannerImportDialog clubUnitId={clubUnitId} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
