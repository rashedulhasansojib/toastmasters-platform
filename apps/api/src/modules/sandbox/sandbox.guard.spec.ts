import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SandboxGuard } from './sandbox.guard';

function makeContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(overrides: {
  roleUnitIds?: string[];
  platformUnitIds?: string[];
  memberships?: { leftAt: Date | null }[];
}) {
  const roleAssignments = {
    findActiveOrgUnitIdsForPerson: vi.fn().mockResolvedValue(overrides.roleUnitIds ?? []),
  };
  const clubMemberships = {
    findByPerson: vi.fn().mockResolvedValue(overrides.memberships ?? []),
  };
  const grantAdmin = {
    findPlatformRoleOrgUnitIdsForPerson: vi.fn().mockResolvedValue(overrides.platformUnitIds ?? []),
  };
  return new SandboxGuard(roleAssignments as never, clubMemberships as never, grantAdmin as never);
}

describe('SandboxGuard', () => {
  it('rejects an unauthenticated request', async () => {
    const guard = makeGuard({});
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(ForbiddenException);
  });

  it('rejects a person with an active role assignment — the 403 that matters most: a real officer must never reach fixture data', async () => {
    const guard = makeGuard({ roleUnitIds: ['club-42'] });
    const request = { user: { userId: 'officer-1', roles: [], scopes: [] } };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
  });

  it('rejects a person with an active club membership even if role assignments are empty', async () => {
    const guard = makeGuard({ memberships: [{ leftAt: null }] });
    const request = { user: { userId: 'member-1', roles: [], scopes: [] } };
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
  });

  it('allows a person whose only membership has ended and who holds no role/platform assignment', async () => {
    const guard = makeGuard({ memberships: [{ leftAt: new Date('2025-01-01') }] });
    const request = { user: { userId: 'demo-1', roles: [], scopes: [] } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('allows a person with zero org-tree footprint at all — the demo-signup case', async () => {
    const guard = makeGuard({});
    const request = { user: { userId: 'demo-2', roles: [], scopes: [] } };
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });
});
