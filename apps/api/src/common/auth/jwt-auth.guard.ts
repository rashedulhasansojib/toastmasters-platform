import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import type { Env } from '@toastmasters/config';
import { ENV } from '../../config/config.module';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { Principal } from '../authz/authz.types';

interface RequestLike {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  user?: Principal;
}

/**
 * Authenticates the caller from a jose-signed session token (httpOnly `session`
 * cookie, set by Slice 8's login, or `Authorization: Bearer`). On success
 * attaches the Principal — including the session claims `activeUnitId`,
 * `programYearId`, `v` (SessionClaims) — to the request; otherwise rejects.
 * Skips routes marked @Public(). This is the authentication gate —
 * authorization is the ResourceGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: Uint8Array;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    this.secret = new TextEncoder().encode(env.SESSION_JWT_SECRET);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestLike>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing session token');

    try {
      const { payload } = await jwtVerify(token, this.secret);
      request.user = {
        userId: String(payload.sub ?? ''),
        roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
        scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [],
        activeUnitId: typeof payload.activeUnitId === 'string' ? payload.activeUnitId : null,
        programYearId: typeof payload.programYearId === 'string' ? payload.programYearId : null,
        v: typeof payload.v === 'number' ? payload.v : undefined,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }

  private extractToken(request: RequestLike): string | undefined {
    const authorization = request.headers['authorization'];
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }
    return request.cookies?.['session'];
  }
}
