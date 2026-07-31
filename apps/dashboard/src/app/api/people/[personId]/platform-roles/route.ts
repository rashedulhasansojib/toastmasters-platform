import { NextResponse } from 'next/server';
import { grantPlatformRoleRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/**
 * Users admin: grant a platform role. No `anchorOrgUnitId` query param —
 * unlike the other people/:personId proxies, this route isn't anchored on an
 * org unit; the API authorizes it against the role's own scope.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
): Promise<NextResponse> {
  const { personId } = await params;

  const parsed = grantPlatformRoleRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/people/${personId}/platform-roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
