import { describe, it, expect } from 'vitest';
import { memberHealthBandFor } from './membership';

/** CLAUDE.md §2 decision 11 (2026-07-30): the member-health signal v1's thresholds. */
describe('memberHealthBandFor', () => {
  it('is healthy at and under 60 days', () => {
    expect(memberHealthBandFor(0)).toBe('healthy');
    expect(memberHealthBandFor(60)).toBe('healthy');
  });

  it('is watch between 61 and 90 days', () => {
    expect(memberHealthBandFor(61)).toBe('watch');
    expect(memberHealthBandFor(90)).toBe('watch');
  });

  it('is at_risk between 91 and 180 days', () => {
    expect(memberHealthBandFor(91)).toBe('at_risk');
    expect(memberHealthBandFor(180)).toBe('at_risk');
  });

  it('is disengaged past 180 days', () => {
    expect(memberHealthBandFor(181)).toBe('disengaged');
    expect(memberHealthBandFor(1000)).toBe('disengaged');
  });
});
