import type { MeetingLiveRecord } from '@toastmasters/contracts';

/**
 * Helpers shared by the three meeting-day tools (timer, ah-counter,
 * grammarian), which all write through `MeetingLiveRecord`.
 *
 * The two keys do different jobs and must not be collapsed:
 *   `targetKey` — what is being reported on. Stable across saves, so a
 *     corrected tally supersedes the earlier one on read.
 *   `clientKey` — one save attempt. Fresh every time Save is pressed, so the
 *     server can dedupe a wifi-drop retry of *that* attempt (FR-MTG-6/NFR-3)
 *     without swallowing a genuine correction.
 * The API returns the newest record per (kind, targetKey); earlier revisions
 * stay in the table as append-only history (NFR-4).
 */

/** A fresh idempotency key for one press of Save. */
export function newAttemptKey(targetKey: string): string {
  return `${targetKey}:${crypto.randomUUID()}`;
}

/** The current record for a target, or undefined if it has never been saved. */
export function latestFor(
  records: MeetingLiveRecord[],
  kind: MeetingLiveRecord['kind'],
  targetKey: string,
): MeetingLiveRecord | undefined {
  return records.find((r) => r.kind === kind && r.targetKey === targetKey);
}

/** Every saved target of a kind, keyed by `targetKey`. */
export function latestByTarget(
  records: MeetingLiveRecord[],
  kind: MeetingLiveRecord['kind'],
): Map<string, MeetingLiveRecord> {
  return new Map(records.filter((r) => r.kind === kind).map((r) => [r.targetKey, r]));
}
