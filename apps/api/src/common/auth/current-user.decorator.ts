import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '../authz/authz.types';

/** Injects the authenticated principal the JwtAuthGuard attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: Principal }>();
    return request.user;
  },
);
