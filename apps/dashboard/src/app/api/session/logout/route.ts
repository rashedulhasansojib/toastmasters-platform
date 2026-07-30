import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_OPTIONS } from '@/lib/session-proxy';

/**
 * Logout is entirely the dashboard's own cookie: the browser never holds the
 * API's session cookie (login and switch-unit are server-to-server calls that
 * re-set it here), and the session JWT carries no server-side state to revoke
 * — `permissionVersion` is the revocation channel, not a session store. So
 * clearing this cookie is the whole logout. Idempotent: no session is still a
 * 204.
 */
export async function POST(): Promise<NextResponse> {
  const jar = await cookies();
  jar.set('session', '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return new NextResponse(null, { status: 204 });
}
