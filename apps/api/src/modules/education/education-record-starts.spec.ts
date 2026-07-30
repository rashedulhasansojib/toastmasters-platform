import { describe, it, expect } from 'vitest';
import { buildAutoStarts } from './education-record-starts';
import type { AutoRequestSlot } from './speech-approval-requests';

const MEETING = { clubUnitId: 'club-1', scheduledAt: new Date('2026-07-30T18:00:00.000Z') };
const SPEAKER = 'person-speaker';
const REQUESTER = 'person-requester';

function slot(overrides: Partial<AutoRequestSlot>): AutoRequestSlot {
  return {
    id: 'slot-1',
    status: 'approved',
    pathCode: 'PM',
    projectCode: 'PM1',
    level: 1,
    speakerPersonId: SPEAKER,
    requestedBy: REQUESTER,
    ...overrides,
  };
}

describe('buildAutoStarts', () => {
  it('starts a fresh record with no backfilled levels for a level-1 slot', () => {
    const starts = buildAutoStarts(MEETING, [slot({ level: 1 })]);
    expect(starts).toEqual([
      {
        personId: SPEAKER,
        clubUnitId: MEETING.clubUnitId,
        pathCode: 'PM',
        startedAt: MEETING.scheduledAt,
        levels: [],
      },
    ]);
  });

  it('backfills levels below the level of a mid-path first speech', () => {
    const starts = buildAutoStarts(MEETING, [slot({ level: 3 })]);
    expect(starts).toHaveLength(1);
    const start = starts[0]!;
    expect(start.levels.map((l) => l.level)).toEqual([1, 2]);
    expect(start.levels.every((l) => l.vpeConfirmedBy === null)).toBe(true);
    expect(start.levels.every((l) => l.backfilledAt !== null)).toBe(true);
  });

  it('skips slots that are requested or declined — never happened', () => {
    const starts = buildAutoStarts(MEETING, [
      slot({ id: 'a', status: 'requested' }),
      slot({ id: 'b', status: 'declined' }),
    ]);
    expect(starts).toEqual([]);
  });

  it('credits the speaker, falling back to the requester for the self-service case', () => {
    const starts = buildAutoStarts(MEETING, [slot({ speakerPersonId: null })]);
    expect(starts[0]!.personId).toBe(REQUESTER);
  });

  it('dedupes two approved slots for the same person and path to the lower level', () => {
    const starts = buildAutoStarts(MEETING, [
      slot({ id: 'a', projectCode: 'PM3', level: 3 }),
      slot({ id: 'b', projectCode: 'PM1', level: 1 }),
    ]);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.levels).toEqual([]);
  });

  it('starts separate records for different paths for the same person', () => {
    const starts = buildAutoStarts(MEETING, [
      slot({ id: 'a', pathCode: 'PM', level: 1 }),
      slot({ id: 'b', pathCode: 'DL', level: 1 }),
    ]);
    expect(starts.map((s) => s.pathCode).sort()).toEqual(['DL', 'PM']);
  });
});
