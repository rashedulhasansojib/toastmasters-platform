import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AuthzService } from './authz.service';
import type { AccessRequest } from './authz.types';
import type { AccessRepository } from '../../modules/access/access.repository';

const request: AccessRequest = {
  principal: { userId: 'u1', roles: [], scopes: [] },
  resource: 'finance.ledger',
  action: 'read',
  scope: 'district.1.club.10',
};

function fakeAccessRepository(overrides: Partial<AccessRepository> = {}): AccessRepository {
  return {
    effectiveGrants: async () => [],
    pathOf: async (id: string) => {
      if (id === 'club-1234') return 'district.1.club.10';
      throw new Error(`Org unit ${id} not found`);
    },
    ...overrides,
  } as unknown as AccessRepository;
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

describe('AuthzService.resolveScope', () => {
  it('resolves a known org unit id to its path', async () => {
    const service = new AuthzService(fakeAccessRepository());
    await expect(service.resolveScope('club-1234')).resolves.toBe('district.1.club.10');
  });

  it('rejects an unknown org unit id with NotFoundException', async () => {
    const service = new AuthzService(fakeAccessRepository());
    await expect(service.resolveScope('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
