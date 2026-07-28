import { describe, it, expect } from 'vitest';
import { canDelegate } from './can-delegate';
import type { Grant } from './authz.types';

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'club_president',
    scope: 'district.1.club.10',
    resource: 'meeting.role',
    action: 'update',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

describe('canDelegate', () => {
  it('allows delegating a grant the actor already holds at the target scope', () => {
    const actorGrants = [grant()];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10',
      }),
    ).toBe(true);
  });

  it('blocks escalation: cannot delegate a resource/action the actor does not hold anywhere (rbac-design.md §12)', () => {
    const actorGrants = [grant()]; // only meeting.role:update at the club
    expect(
      canDelegate(actorGrants, { resource: 'platform.audit', action: 'read', scope: 'district.1' }),
    ).toBe(false);
  });

  it('blocks delegating a grant the actor holds at a different scope', () => {
    const actorGrants = [grant({ scope: 'district.1.club.99' })];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10',
      }),
    ).toBe(false);
  });

  it('respects exactOnly identically to evaluate() — a self_unit grant does not cover a child scope', () => {
    const actorGrants = [grant({ exactOnly: true })];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10.sub',
      }),
    ).toBe(false);
  });

  it('ignores a deny grant — denies never confer delegation authority', () => {
    const actorGrants = [grant({ effect: 'deny' })];
    expect(
      canDelegate(actorGrants, {
        resource: 'meeting.role',
        action: 'update',
        scope: 'district.1.club.10',
      }),
    ).toBe(false);
  });
});
