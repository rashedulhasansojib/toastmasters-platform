import { describe, it, expect } from 'vitest';
import { AuthzService } from './authz.service';
import type { AccessRequest } from './authz.types';

const request: AccessRequest = {
  principal: { userId: 'u1', roles: [], scopes: [] },
  resource: 'finance.ledger',
  action: 'read',
  scope: 'district.1.club.10',
};

describe('AuthzService', () => {
  const service = new AuthzService();

  it('denies by default while no grants are seeded', async () => {
    const decision = await service.authorize(request);
    expect(decision).toEqual({ allowed: false, reason: 'default-deny' });
  });

  it('explain() returns the considered set alongside the decision', async () => {
    const { decision, considered } = await service.explain(request);
    expect(considered).toEqual([]);
    expect(decision.allowed).toBe(false);
  });
});
