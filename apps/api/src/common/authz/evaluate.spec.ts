import { describe, it, expect } from 'vitest';
import { scopeCovers, conditionHolds, evaluate } from './evaluate';
import type { AccessRequest, Grant } from './authz.types';

const baseRequest: AccessRequest = {
  principal: { userId: 'u1', roles: ['club_treasurer'], scopes: ['district.1.club.10'] },
  resource: 'finance.ledger',
  action: 'read',
  scope: 'district.1.club.10',
};

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'club_treasurer',
    scope: 'district.1.club.10',
    resource: 'finance.ledger',
    action: 'read',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

describe('scopeCovers', () => {
  it('matches an identical scope', () => {
    expect(scopeCovers('district.1.club.10', 'district.1.club.10')).toBe(true);
  });
  it('matches a descendant scope', () => {
    expect(scopeCovers('district.1', 'district.1.club.10')).toBe(true);
  });
  it('does not match a sibling or prefix-lookalike', () => {
    expect(scopeCovers('district.1', 'district.10')).toBe(false);
    expect(scopeCovers('district.1.club.10', 'district.1')).toBe(false);
  });
});

describe('conditionHolds', () => {
  it('any always holds', () => {
    expect(conditionHolds('any', baseRequest)).toBe(true);
  });
  it('own holds only when the caller owns the resource', () => {
    expect(conditionHolds('own', baseRequest)).toBe(false);
    expect(conditionHolds('own', { ...baseRequest, context: { isOwner: true } })).toBe(true);
  });
  it('assigned/party/published read their context flags', () => {
    expect(conditionHolds('assigned', { ...baseRequest, context: { isAssigned: true } })).toBe(
      true,
    );
    expect(conditionHolds('party', { ...baseRequest, context: { isParty: true } })).toBe(true);
    expect(conditionHolds('published', { ...baseRequest, context: { isPublished: true } })).toBe(
      true,
    );
  });
});

describe('evaluate', () => {
  it('denies by default with no grants', () => {
    expect(evaluate([], baseRequest)).toEqual({ allowed: false, reason: 'default-deny' });
  });

  it('allows when an applicable allow grant exists', () => {
    expect(evaluate([grant()], baseRequest)).toEqual({ allowed: true, reason: 'granted' });
  });

  it('lets deny beat allow', () => {
    expect(evaluate([grant(), grant({ effect: 'deny' })], baseRequest)).toEqual({
      allowed: false,
      reason: 'explicit-deny',
    });
  });

  it('ignores grants for a different resource, action or scope', () => {
    expect(evaluate([grant({ resource: 'meeting.agenda' })], baseRequest).allowed).toBe(false);
    expect(evaluate([grant({ action: 'delete' })], baseRequest).allowed).toBe(false);
    expect(evaluate([grant({ scope: 'district.2' })], baseRequest).allowed).toBe(false);
  });

  it('respects an ownership condition', () => {
    const owned = [grant({ condition: 'own' })];
    expect(evaluate(owned, baseRequest).allowed).toBe(false);
    expect(evaluate(owned, { ...baseRequest, context: { isOwner: true } }).allowed).toBe(true);
  });

  it('honours a grant from an ancestor scope', () => {
    const districtGrant = [grant({ scope: 'district.1' })];
    expect(evaluate(districtGrant, baseRequest).allowed).toBe(true);
  });
});
