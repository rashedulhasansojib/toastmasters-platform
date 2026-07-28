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
import { PersonRepository } from '../../modules/identity/person.repository';
import { SessionService } from './session.service';

interface RequestLike {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  user?: Principal;
}

interface ResponseLike {
  cookie(name: string, value: string, options: object): void;
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
    private readonly people: PersonRepository,
    private readonly session: SessionService,
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

    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.secret));
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    const userId = String(payload.sub ?? '');
    const person = await this.people.findById(userId);
    if (!person) throw new UnauthorizedException('Invalid session');

    const activeUnitId = typeof payload.activeUnitId === 'string' ? payload.activeUnitId : null;
    const programYearId = typeof payload.programYearId === 'string' ? payload.programYearId : null;
    const tokenV = typeof payload.v === 'number' ? payload.v : undefined;

    request.user = {
      userId,
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
      scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [],
      activeUnitId,
      programYearId,
      v: person.permissionVersion,
    };

    // rbac-design.md §5: "if v != current permission_version, ... the token
    // reissued." authorize() never trusts v — this only keeps the cookie's
    // own claim from going stale after a mid-session revocation.
    if (tokenV !== person.permissionVersion) {
      const newToken = await this.session.issue({
        sub: userId,
        activeUnitId,
        programYearId,
        v: person.permissionVersion,
      });
      const response = context.switchToHttp().getResponse<ResponseLike>();
      response.cookie('session', newToken, this.session.cookieOptions());
    }

    return true;
  }

  private extractToken(request: RequestLike): string | undefined {
    const authorization = request.headers['authorization'];
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }
    return request.cookies?.['session'];
  }
}
