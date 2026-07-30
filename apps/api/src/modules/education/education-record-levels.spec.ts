import { describe, it, expect } from 'vitest';
import { buildBackfillLevels } from './education-record-levels';

const AT = new Date('2026-07-30T12:00:00.000Z');
const VPE = 'aaaaaaaa-0000-4000-8000-000000000009';

describe('buildBackfillLevels', () => {
  it('produces no levels when starting at level 1', () => {
    expect(buildBackfillLevels(1, null, AT)).toEqual([]);
  });

  it('backfills every level below the starting level, in order', () => {
    const levels = buildBackfillLevels(4, null, AT);
    expect(levels.map((l) => l.level)).toEqual([1, 2, 3]);
  });

  it('stamps memberMarkedCompleteAt, vpeConfirmedAt and backfilledAt with the same instant', () => {
    const level = buildBackfillLevels(2, null, AT)[0]!;
    expect(level.memberMarkedCompleteAt).toBe(AT.toISOString());
    expect(level.vpeConfirmedAt).toBe(AT.toISOString());
    expect(level.backfilledAt).toBe(AT.toISOString());
  });

  it('never fabricates delivered projects', () => {
    const level = buildBackfillLevels(2, null, AT)[0]!;
    expect(level.projectsDelivered).toEqual([]);
  });

  it('leaves vpeConfirmedBy null when no human actor confirmed it (automatic trigger)', () => {
    const level = buildBackfillLevels(3, null, AT)[0]!;
    expect(level.vpeConfirmedBy).toBeNull();
  });

  it('attributes vpeConfirmedBy to the VPE for a manual start', () => {
    const level = buildBackfillLevels(3, VPE, AT)[0]!;
    expect(level.vpeConfirmedBy).toBe(VPE);
  });

  it('caps at level 5 without erroring past the top of the path', () => {
    const levels = buildBackfillLevels(5, null, AT);
    expect(levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
  });
});
