import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import type { Env } from '@toastmasters/config';
import { ENV } from '../../config/config.module';
import type { SessionClaims } from './session.types';

export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: '/';
}

/**
 * Issues the httpOnly session cookie's JWT (jose, HS256). No roles/scopes are
 * embedded (CLAUDE.md §5) — `authorize()` always re-resolves grants from
 * `sub` against the database, never trusts the token for permissions.
 */
@Injectable()
export class SessionService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async issue(claims: SessionClaims): Promise<string> {
    return new SignJWT({
      activeUnitId: claims.activeUnitId,
      programYearId: claims.programYearId,
      v: claims.v,
      roles: [],
      scopes: [],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${this.env.SESSION_TTL_SECONDS}s`)
      .sign(new TextEncoder().encode(this.env.SESSION_JWT_SECRET));
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: this.env.SESSION_TTL_SECONDS * 1000,
      path: '/',
    };
  }
}
