import { describe, it, expect } from 'vitest';
import { computeDeleteAfter, PROSPECT_RETENTION_DAYS } from './prospect.service';

describe('computeDeleteAfter', () => {
  it('is exactly 180 days after the given instant (CLAUDE.md §2 decision 4)', () => {
    expect(PROSPECT_RETENTION_DAYS).toBe(180);
    const from = new Date('2026-07-29T00:00:00.000Z');
    const result = computeDeleteAfter(from);
    expect(result.toISOString()).toBe('2027-01-25T00:00:00.000Z');
  });

  it('carries across a year boundary correctly', () => {
    const from = new Date('2026-12-01T12:00:00.000Z');
    const result = computeDeleteAfter(from);
    expect(result.getUTCFullYear()).toBe(2027);
    expect(result > from).toBe(true);
  });

  it('does not mutate the input date', () => {
    const from = new Date('2026-07-29T00:00:00.000Z');
    const original = from.toISOString();
    computeDeleteAfter(from);
    expect(from.toISOString()).toBe(original);
  });
});
