import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { registerRequestSchema } from '@toastmasters/contracts';
import { callApi, extractSessionCookie, SESSION_COOKIE_OPTIONS } from '@/lib/session-proxy';

/** The public sandbox-signup form's half of the BFF proxy — mirrors the login route. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = registerRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await callApi('/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      { message: 'Signup succeeded but no session was issued' },
      { status: 502 },
    );
  }

  const jar = await cookies();
  jar.set('session', session.token, { ...SESSION_COOKIE_OPTIONS, maxAge: session.maxAge });
  return NextResponse.json(await upstream.json());
}
