'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import type {
  ClubEducationProgressRow,
  PathwayPath,
  SpeechApprovalStatus,
} from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** One line of the member's path: a catalogue project, plus what they have delivered against it. */
interface ProjectRow {
  level: number;
  projectCode: string;
  name: string;
  speechTitle: string | null;
  completedAt: string | null;
  approvalId: string | null;
  approvalStatus: SpeechApprovalStatus | null;
  approvedAt: string | null;
}

function buildProjectRows(
  path: PathwayPath | null,
  deliveries: ClubEducationProgressRow['deliveredProjects'],
): ProjectRow[] {
  if (!path) return [];
  const byProject = new Map(deliveries.map((d) => [d.projectCode, d]));
  return [...path.projects]
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((project) => {
      const delivery = byProject.get(project.projectCode) ?? null;
      return {
        level: project.level,
        projectCode: project.projectCode,
        name: project.name,
        speechTitle: delivery?.speechTitle ?? null,
        completedAt: delivery?.deliveredAt ?? null,
        approvalId: delivery?.approvalId ?? null,
        approvalStatus: delivery?.approvalStatus ?? null,
        approvedAt: delivery?.approvedAt ?? null,
      };
    });
}

function Placeholder() {
  return <span className="text-muted-foreground/60">--</span>;
}

/**
 * The pill the reader recognises at a glance. Approved is green (the good
 * state, the one that counts), Pending amber (waiting on someone), Denied
 * red (the negative decision, not just "missing"). Undelivered projects
 * show nothing — the completion-date column already carries "not yet".
 */
function ApprovalPill({ status }: { status: SpeechApprovalStatus | null }) {
  if (status === null) return null;
  const label = status === 'requested' ? 'Pending' : status === 'approved' ? 'Approved' : 'Denied';
  const tone =
    status === 'approved'
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : status === 'denied'
        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone,
      )}
    >
      {label}
    </span>
  );
}

/**
 * Two buttons and (on Deny) an inline reason input. Only rendered when the
 * caller can act (VPE) and the row is still `requested`. Once a decision
 * lands, we do a `router.refresh()` to re-fetch the roster — server
 * component boundaries are the source of truth.
 */
function ApprovalActions({
  clubUnitId,
  approvalId,
  onDone,
}: {
  clubUnitId: string;
  approvalId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/education/approvals/${approvalId}/approve`,
        {
          method: 'POST',
        },
      );
      if (!res.ok) {
        setError('Could not approve.');
        return;
      }
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitDeny(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/education/approvals/${approvalId}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        setError('Could not deny.');
        return;
      }
      setDenying(false);
      setReason('');
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (denying) {
    return (
      <form onSubmit={submitDeny} className="mt-2 flex flex-col gap-1.5">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for denial"
          required
          minLength={1}
          disabled={busy}
          aria-label="Reason for denial"
          className="h-8 text-xs"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="destructive" disabled={busy || !reason.trim()}>
            Confirm deny
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDenying(false);
              setReason('');
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={approve} disabled={busy}>
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setDenying(true)}
        disabled={busy}
      >
        Deny
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * The per-member Pathways detail, as a right-hand drawer.
 *
 * The project list is the **seeded catalogue** for the member's path, so it
 * is only as complete as `pathway_project` — a path with nothing seeded says
 * so rather than rendering an empty table that reads as "no projects exist".
 * Speech Title and Completion Date come from the earliest approved slot on a
 * closed meeting for that project (the same evidence the level counter is
 * built from); an undelivered project shows a dash rather than a fabricated
 * date.
 *
 * M11 Slice 2: each delivered row carries the VPE approval status. A VPE
 * caller can approve or deny a pending row inline; other roles see the pill
 * but no buttons — permission logic stays on the server, this is only the
 * affordance gate.
 */
export function MemberPathwayPanel({
  clubUnitId,
  row,
  pathways,
  canApprove,
  onClose,
}: {
  clubUnitId: string;
  row: ClubEducationProgressRow | null;
  pathways: PathwayPath[];
  canApprove: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // The drawer scrolls its own body; letting the page scroll behind it on a
    // phone is the classic way to lose your place in the roster.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [row, onClose]);

  if (!row || typeof document === 'undefined') return null;

  const path = pathways.find((p) => p.pathCode === row.pathCode) ?? null;
  const projectRows = buildProjectRows(path, row.deliveredProjects);
  const heading = row.pathName
    ? `${row.pathName} Progress for ${row.fullName}`
    : `Pathways Progress for ${row.fullName}`;

  const body = (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-150"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="relative flex h-full w-full flex-col bg-background shadow-xl animate-in slide-in-from-right duration-200 sm:max-w-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-balance">{heading}</h2>
            {row.pathCode === null && (
              <p className="mt-1 text-xs text-muted-foreground">
                This member has not started a path yet.
              </p>
            )}
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {projectRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {row.pathCode === null
                ? 'Start a path for this member to see their project list.'
                : `No projects are seeded in the Pathways catalogue for ${row.pathName} yet.`}
            </p>
          ) : (
            <>
              {/* Desktop: the five-column table (Level, Project, Speech
                  Title, Completion Date, Approval status). */}
              <table className="hidden w-full border-separate border-spacing-0 text-sm sm:table">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-border py-2 pr-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      Level
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                    >
                      Project
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      Speech Title
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      Completion Date
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border py-2 pl-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      Approval
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectRows.map((project) => (
                    <tr key={project.projectCode}>
                      <td className="border-b border-border py-3 pr-3 align-top whitespace-nowrap text-muted-foreground">
                        Level {project.level}
                      </td>
                      <td className="border-b border-border px-3 py-3 align-top font-medium">
                        {project.name}
                      </td>
                      <td className="border-b border-border px-3 py-3 align-top">
                        {project.speechTitle ?? <Placeholder />}
                      </td>
                      <td className="border-b border-border px-3 py-3 align-top whitespace-nowrap">
                        {project.completedAt ? (
                          new Date(project.completedAt).toLocaleDateString()
                        ) : (
                          <Placeholder />
                        )}
                      </td>
                      <td className="border-b border-border py-3 pl-3 align-top">
                        <div className="flex flex-col gap-1">
                          <ApprovalPill status={project.approvalStatus} />
                          {canApprove &&
                            project.approvalStatus === 'requested' &&
                            project.approvalId && (
                              <ApprovalActions
                                clubUnitId={clubUnitId}
                                approvalId={project.approvalId}
                                onDone={() => {}}
                              />
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: the same rows stacked, so five columns never squeeze
                  a project name down to one word per line. */}
              <ul className="flex flex-col gap-3 sm:hidden">
                {projectRows.map((project) => (
                  <li
                    key={project.projectCode}
                    className="rounded-lg border border-border px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Level {project.level}</p>
                        <p className="mt-0.5 font-medium">{project.name}</p>
                      </div>
                      <ApprovalPill status={project.approvalStatus} />
                    </div>
                    <dl className="mt-2 flex flex-col gap-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">Speech Title</dt>
                        <dd className="min-w-0">{project.speechTitle ?? <Placeholder />}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-muted-foreground">Completion Date</dt>
                        <dd className="min-w-0">
                          {project.completedAt ? (
                            new Date(project.completedAt).toLocaleDateString()
                          ) : (
                            <Placeholder />
                          )}
                        </dd>
                      </div>
                    </dl>
                    {canApprove && project.approvalStatus === 'requested' && project.approvalId && (
                      <ApprovalActions
                        clubUnitId={clubUnitId}
                        approvalId={project.approvalId}
                        onDone={() => {}}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
