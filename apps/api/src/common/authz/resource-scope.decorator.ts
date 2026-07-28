import { SetMetadata } from '@nestjs/common';
import type { Action } from './authz.types';

export interface ResourceScopeMeta {
  resource: string;
  action: Action;
  /**
   * Resolve scope from an org-unit id carried in the request (via
   * AuthzService.resolveScope), rather than trusting a raw ltree path.
   * Omit to keep the legacy behavior of reading `?scope=<path>` directly
   * (Slice 7's access inspector, an admin tool that already deals in paths).
   */
  locate?: { source: 'param' | 'query'; key: string };
}

export const RESOURCE_SCOPE_KEY = 'resourceScope';

/**
 * Declares the resource + action a route touches. The ResourceGuard turns this
 * into an AccessRequest and runs it through authorize(). Routes without it are
 * governed by authentication alone.
 */
export const ResourceScope = (
  resource: string,
  action: Action,
  locate?: ResourceScopeMeta['locate'],
) => SetMetadata(RESOURCE_SCOPE_KEY, { resource, action, locate } satisfies ResourceScopeMeta);
