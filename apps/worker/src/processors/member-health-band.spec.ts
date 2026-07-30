import { describe, it, expect } from 'vitest';
import { bandFor } from './member-health-band';

/** CLAUDE.md §2 decision 11 (2026-07-30): the member-health signal v1's thresholds. */
describe('bandFor', () => {
  it('is healthy at and under 60 days', () => {
    expect(bandFor(0)).toBe('healthy');
    expect(bandFor(60)).toBe('healthy');
  });

  it('is watch between 61 and 90 days', () => {
    expect(bandFor(61)).toBe('watch');
    expect(bandFor(90)).toBe('watch');
  });

  it('is at_risk between 91 and 180 days', () => {
    expect(bandFor(91)).toBe('at_risk');
    expect(bandFor(180)).toBe('at_risk');
  });

  it('is disengaged past 180 days', () => {
    expect(bandFor(181)).toBe('disengaged');
    expect(bandFor(1000)).toBe('disengaged');
  });
});
