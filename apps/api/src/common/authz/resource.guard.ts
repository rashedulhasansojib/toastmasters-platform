import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AuthzService } from './authz.service';
import { RESOURCE_SCOPE_KEY, type ResourceScopeMeta } from './resource-scope.decorator';
import { ROLES_KEY } from './roles.decorator';
import type { Principal } from './authz.types';

interface RequestLike {
  user?: Principal;
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
}

/**
 * Authorization guard. Runs after JwtAuthGuard. Enforces @Roles() and, when a
 * route declares @ResourceScope(), builds an AccessRequest and defers to the
 * single authorize() gate. Default-deny: an authenticated caller still needs a
 * grant to pass a scoped route.
 */
@Injectable()
export class ResourceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestLike>();
    const principal = request.user;
    if (!principal) throw new ForbiddenException('No authenticated principal');

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.some((role) => principal.roles.includes(role))) {
      throw new ForbiddenException('Missing required role');
    }

    const meta = this.reflector.getAllAndOverride<ResourceScopeMeta>(RESOURCE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true; // Authentication-only route.

    const scope = meta.locate
      ? await this.authz.resolveScope(
          (meta.locate.source === 'param' ? request.params : request.query)?.[meta.locate.key] ??
            '',
        )
      : (request.params?.['scope'] ?? request.query?.['scope'] ?? '');
    const decision = await this.authz.authorize({
      principal,
      resource: meta.resource,
      action: meta.action,
      scope,
    });
    if (!decision.allowed) {
      throw new ForbiddenException(`Access denied (${decision.reason})`);
    }
    return true;
  }
}
