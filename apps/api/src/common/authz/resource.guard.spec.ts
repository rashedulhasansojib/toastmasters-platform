import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { ResourceGuard } from './resource.guard';
import { RESOURCE_SCOPE_KEY, type ResourceScopeMeta } from './resource-scope.decorator';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from './roles.decorator';

function makeContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
  } as unknown as ExecutionContext;
}

function makeReflector(overrides: {
  isPublic?: boolean;
  roles?: string[];
  meta?: ResourceScopeMeta;
}) {
  return {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return overrides.isPublic;
      if (key === ROLES_KEY) return overrides.roles;
      if (key === RESOURCE_SCOPE_KEY) return overrides.meta;
      return undefined;
    }),
  } as unknown as Reflector;
}

describe('ResourceGuard', () => {
  it('resolves scope via resolveScope() when the route declares `locate`', async () => {
    const authz = {
      resolveScope: vi.fn().mockResolvedValue('d41.divA.a1.c1234'),
      authorize: vi.fn().mockResolvedValue({ allowed: true, reason: 'granted' }),
    };
    const reflector = makeReflector({
      meta: {
        resource: 'meeting.meeting',
        action: 'create',
        locate: { source: 'param', key: 'clubUnitId' },
      },
    });
    const guard = new ResourceGuard(reflector, authz as never);
    const request = {
      user: { userId: 'u1', roles: [], scopes: [] },
      params: { clubUnitId: 'club-1234' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(authz.resolveScope).toHaveBeenCalledWith('club-1234');
    expect(authz.authorize).toHaveBeenCalledWith({
      principal: request.user,
      resource: 'meeting.meeting',
      action: 'create',
      scope: 'd41.divA.a1.c1234',
    });
  });

  it('falls back to a raw query.scope when the route declares no `locate` (Slice 7 inspector routes)', async () => {
    const authz = {
      resolveScope: vi.fn(),
      authorize: vi.fn().mockResolvedValue({ allowed: true, reason: 'granted' }),
    };
    const reflector = makeReflector({
      meta: { resource: 'platform.audit', action: 'read' },
    });
    const guard = new ResourceGuard(reflector, authz as never);
    const request = {
      user: { userId: 'u1', roles: [], scopes: [] },
      query: { scope: 'd41.divA.a1.c1234' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(authz.resolveScope).not.toHaveBeenCalled();
    expect(authz.authorize).toHaveBeenCalledWith({
      principal: request.user,
      resource: 'platform.audit',
      action: 'read',
      scope: 'd41.divA.a1.c1234',
    });
  });

  it('denies when authorize() denies', async () => {
    const authz = {
      resolveScope: vi.fn().mockResolvedValue('d41.divA.a1.c1234'),
      authorize: vi.fn().mockResolvedValue({ allowed: false, reason: 'default-deny' }),
    };
    const reflector = makeReflector({
      meta: {
        resource: 'meeting.meeting',
        action: 'read',
        locate: { source: 'param', key: 'clubUnitId' },
      },
    });
    const guard = new ResourceGuard(reflector, authz as never);
    const request = {
      user: { userId: 'u1', roles: [], scopes: [] },
      params: { clubUnitId: 'club-9999' },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow();
  });
});
