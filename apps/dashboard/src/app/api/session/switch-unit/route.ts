import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { switchUnitRequestSchema } from '@toastmasters/contracts';
import { callApi, extractSessionCookie, SESSION_COOKIE_OPTIONS } from '@/lib/session-proxy';

/** The dashboard's half of the BFF proxy (Slice 7) — same shape as /api/session/login, forwarding the existing cookie instead of a login body. */
export async function POST(request: Request): Promise<NextResponse> {
  const jar = await cookies();
  const token = jar.get('session')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Not logged in' }, { status: 401 });
  }

  const parsed = switchUnitRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await callApi('/v1/auth/switch-unit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
    body: JSON.stringify(parsed.data),
  });
  if (!upstream.ok) {
    return NextResponse.json(await upstream.json().catch(() => ({})), {
      status: upstream.status,
    });
  }

  const session = extractSessionCookie(upstream);
  if (!session) {
    return NextResponse.json(
      { message: 'Switch succeeded but no session was reissued' },
      {
        status: 502,
      },
    );
  }

  jar.set('session', session.token, { ...SESSION_COOKIE_OPTIONS, maxAge: session.maxAge });
  return NextResponse.json(await upstream.json());
}
