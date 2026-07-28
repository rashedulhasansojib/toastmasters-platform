import { describe, it, expect } from 'vitest';
import { AuthzService } from './authz.service';
import type { AccessRequest } from './authz.types';
import type { AccessRepository } from '../../modules/access/access.repository';

const request: AccessRequest = {
  principal: { userId: 'u1', roles: [], scopes: [] },
  resource: 'finance.ledger',
  action: 'read',
  scope: 'district.1.club.10',
};

function fakeAccessRepository(): AccessRepository {
  return { effectiveGrants: async () => [] } as unknown as AccessRepository;
}

describe('AuthzService', () => {
  it('denies by default while no grants resolve', async () => {
    const service = new AuthzService(fakeAccessRepository());
    const decision = await service.authorize(request);
    expect(decision).toEqual({ allowed: false, reason: 'default-deny' });
  });

  it('explain() returns the considered set alongside the decision', async () => {
    const service = new AuthzService(fakeAccessRepository());
    const { decision, considered } = await service.explain(request);
    expect(considered).toEqual([]);
    expect(decision.allowed).toBe(false);
  });
});
