import { SetMetadata } from '@nestjs/common';
import type { Action } from './authz.types';

export interface ResourceScopeMeta {
  resource: string;
  action: Action;
}

export const RESOURCE_SCOPE_KEY = 'resourceScope';

/**
 * Declares the resource + action a route touches. The ResourceGuard turns this
 * into an AccessRequest and runs it through authorize(). Routes without it are
 * governed by authentication alone.
 */
export const ResourceScope = (resource: string, action: Action) =>
  SetMetadata(RESOURCE_SCOPE_KEY, { resource, action } satisfies ResourceScopeMeta);
