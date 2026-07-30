import { describe, it, expect } from 'vitest';
import {
  MEMBER_HEALTH_SIGNAL_QUEUE,
  MemberHealthSignalProcessor,
} from './member-health-signal.processor';

/** Threshold behavior itself is covered by contracts' `memberHealthBandFor` spec — this just guards the wiring. */
describe('MemberHealthSignalProcessor', () => {
  it('registers on the member-health-signal queue', () => {
    expect(MEMBER_HEALTH_SIGNAL_QUEUE).toBe('member-health-signal');
    expect(MemberHealthSignalProcessor).toBeDefined();
  });
});
