import type { EducationRecordLevel } from '@toastmasters/contracts';
import { buildBackfillLevels } from './education-record-levels';
import type { AutoRequestMeeting, AutoRequestSlot } from './speech-approval-requests';

/**
 * Companion to `buildAutoRequests` (speech-approval-requests.ts): enumerate
 * the `EducationRecord`s a closing meeting should auto-start.
 *
 * A pure function for the same reason — the transactional hook stays a thin
 * adapter and the behaviour is unit-testable without a database. The rules:
 *
 * 1. Only `approved` speech slots count — same "this actually happened"
 *    filter `buildAutoRequests` uses.
 * 2. Delivery is credited to `speakerPersonId ?? requestedBy`, matching
 *    every other education projection.
 * 3. One `EducationRecord` per (person, path) — a person with two approved
 *    slots on different projects of the same path in one meeting still only
 *    starts one record, at the **lowest** level among them (the most
 *    conservative choice: least backfilled).
 * 4. When that lowest level is >1, the levels below it are bulk-marked
 *    complete via `buildBackfillLevels` with no human confirmer
 *    (`confirmedBy: null`) — there's no VPE actor in an automatic trigger.
 *    Whether the record actually gets created is left to the caller's
 *    `skipDuplicates` insert: a person who already has a record for that
 *    path is never touched here, so real progress is never overwritten.
 */

export interface AutoStart {
  personId: string;
  clubUnitId: string;
  pathCode: string;
  startedAt: Date;
  levels: EducationRecordLevel[];
}

interface Candidate {
  personId: string;
  pathCode: string;
  level: number;
}

export function buildAutoStarts(
  meeting: AutoRequestMeeting,
  slots: AutoRequestSlot[],
): AutoStart[] {
  const lowestByPersonPath = new Map<string, Candidate>();
  for (const slot of slots) {
    if (slot.status !== 'approved') continue;
    const personId = slot.speakerPersonId ?? slot.requestedBy;
    if (!personId) continue;
    const key = `${personId} ${slot.pathCode}`;
    const current = lowestByPersonPath.get(key);
    if (current === undefined || slot.level < current.level) {
      lowestByPersonPath.set(key, { personId, pathCode: slot.pathCode, level: slot.level });
    }
  }

  return [...lowestByPersonPath.values()].map(({ personId, pathCode, level }) => ({
    personId,
    clubUnitId: meeting.clubUnitId,
    pathCode,
    startedAt: meeting.scheduledAt,
    levels: level > 1 ? buildBackfillLevels(level, null, meeting.scheduledAt) : [],
  }));
}
