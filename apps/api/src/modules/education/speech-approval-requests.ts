/**
 * M11 Slice 1: enumerate the auto-requests a closing meeting owes VPE.
 *
 * A pure function so the transactional hook stays a thin adapter and the
 * behaviour is unit-testable without a database. The rules:
 *
 * 1. Only `approved` speech slots count — a `requested` slot never happened,
 *    a `declined` one was rejected before the meeting.
 * 2. Delivery is credited to `speakerPersonId ?? requestedBy`, the same rule
 *    the roster projection uses; a slot with neither has no owner and is
 *    skipped rather than credited to nobody.
 * 3. `requestedAt` is the meeting's `scheduledAt` — the meeting is `closed`,
 *    so its scheduled instant is when the speech actually happened. Not the
 *    real wall-clock of the close call, which would drift if a VPE closes
 *    the meeting hours or days later.
 */

export interface AutoRequestSlot {
  id: string;
  status: string;
  pathCode: string;
  projectCode: string;
  level: number;
  speakerPersonId: string | null;
  requestedBy: string;
}

export interface AutoRequestMeeting {
  clubUnitId: string;
  scheduledAt: Date;
}

export interface AutoRequest {
  speechSlotId: string;
  personId: string;
  clubUnitId: string;
  pathCode: string;
  projectCode: string;
  level: number;
  requestedAt: Date;
}

export function buildAutoRequests(
  meeting: AutoRequestMeeting,
  slots: AutoRequestSlot[],
): AutoRequest[] {
  const requests: AutoRequest[] = [];
  for (const slot of slots) {
    if (slot.status !== 'approved') continue;
    const personId = slot.speakerPersonId ?? slot.requestedBy;
    if (!personId) continue;
    requests.push({
      speechSlotId: slot.id,
      personId,
      clubUnitId: meeting.clubUnitId,
      pathCode: slot.pathCode,
      projectCode: slot.projectCode,
      level: slot.level,
      requestedAt: meeting.scheduledAt,
    });
  }
  return requests;
}
