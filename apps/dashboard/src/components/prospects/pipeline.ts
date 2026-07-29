import {
  prospectPipelineStatus,
  prospectCommunicationChannel,
  type Prospect,
  type ProspectPipelineStatus,
  type ProspectCommunicationChannel,
} from '@toastmasters/contracts';

/** Column order, straight off the contract enum so the two can never drift. */
export const PIPELINE_STATUSES = prospectPipelineStatus.options;

export const STATUS_LABEL: Record<ProspectPipelineStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  not_interested: 'Not interested',
  joined: 'Joined',
};

/**
 * The only values `updateProspectRequestSchema` accepts. `new` is the
 * create-time default and `joined` is set exclusively by the conversion
 * handler — PATCHing either is a 400. The UI must never offer them as a move.
 */
export const MOVABLE_STATUSES = ['contacted', 'interested', 'not_interested'] as const;
export type MovableStatus = (typeof MOVABLE_STATUSES)[number];

export function isMovableStatus(status: ProspectPipelineStatus): status is MovableStatus {
  return (MOVABLE_STATUSES as readonly string[]).includes(status);
}

/** Column accent + status dot. Neutral theme, so the pipeline carries the only colour. */
export const STATUS_ACCENT: Record<ProspectPipelineStatus, string> = {
  new: 'bg-slate-400',
  contacted: 'bg-blue-500',
  interested: 'bg-amber-500',
  not_interested: 'bg-rose-500',
  joined: 'bg-emerald-500',
};

export const STATUS_CHIP: Record<ProspectPipelineStatus, string> = {
  new: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  contacted: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  interested: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  not_interested: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  joined: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

export const CHANNEL_LABEL: Record<ProspectCommunicationChannel, string> = {
  call: 'Call',
  message: 'Message',
  email: 'Email',
  in_person: 'In person',
  other: 'Other',
};

export const CHANNELS = prospectCommunicationChannel.options;

/**
 * The nightly retention job (180 days, CLAUDE.md §2 decision 4) nulls a
 * prospect's PII in place rather than deleting the row, so the pipeline keeps
 * its shape. Such a row is read-only history — no contact actions, no edit.
 */
export function isRedacted(prospect: Prospect): boolean {
  return prospect.piiRedactedAt !== null;
}

/** Digits-only `wa.me` deep link, or null when there's no number to dial. */
export function whatsappLink(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "in 42 days" / "12 days ago" — used for the retention countdown. */
export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}
