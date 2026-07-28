import { cookies } from 'next/headers';
import {
  sessionResponseSchema,
  switchableUnit,
  type SessionResponse,
  type SwitchableUnit,
} from '@toastmasters/contracts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function sessionCookieHeader(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get('session')?.value;
  return token ? `session=${token}` : null;
}

/** Server-only: no session cookie, or an expired/invalid one, both resolve to null — never throw for the ordinary logged-out case. */
export async function getSession(): Promise<SessionResponse | null> {
  const cookieHeader = await sessionCookieHeader();
  if (!cookieHeader) return null;

  const response = await fetch(`${API_BASE}/v1/auth/me`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return sessionResponseSchema.parse(await response.json());
}

export async function getSwitchableUnits(): Promise<SwitchableUnit[]> {
  const cookieHeader = await sessionCookieHeader();
  if (!cookieHeader) return [];

  const response = await fetch(`${API_BASE}/v1/auth/switchable-units`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  return switchableUnit.array().parse(await response.json());
}
