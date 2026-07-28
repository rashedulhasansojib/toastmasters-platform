const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Server-to-server call to the real API — no browser, no CORS involved. The
 * two route handlers that use this (login, switch-unit) are the only place
 * the dashboard talks to the API's session endpoints directly; every other
 * server-side read goes through lib/session.ts, which forwards the
 * dashboard's own cookie instead.
 */
export async function callApi(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, cache: 'no-store' });
}

/**
 * The API's login/switch-unit responses set exactly one cookie, so a plain
 * `.get('set-cookie')` (which the Fetch spec joins with ", " when there are
 * several) is safe here — there's only ever one to join.
 */
export function extractSessionCookie(upstream: Response): { token: string; maxAge: number } | null {
  const raw = upstream.headers.get('set-cookie');
  if (!raw) return null;
  const tokenMatch = raw.match(/^session=([^;]+)/);
  if (!tokenMatch?.[1]) return null;
  const maxAgeMatch = raw.match(/Max-Age=(\d+)/i);
  return {
    token: tokenMatch[1],
    // Falls back to the API's documented default (.env.example) only if the
    // upstream header is ever missing Max-Age — should not happen in practice.
    maxAge: maxAgeMatch?.[1] ? Number(maxAgeMatch[1]) : 43_200,
  };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
