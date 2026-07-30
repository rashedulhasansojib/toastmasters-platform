import { NextResponse } from 'next/server';
import { setPersonPasswordRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/**
 * Users admin password reset (super-admin People page). Zod-parses the body
 * at the proxy so a malformed request never leaves the dashboard — the API
 * would reject it anyway, but a 422 here avoids a wasted round trip.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
): Promise<NextResponse> {
  const { personId } = await params;
  const anchorOrgUnitId = new URL(request.url).searchParams.get('anchorOrgUnitId');
  if (!anchorOrgUnitId) {
    return NextResponse.json({ message: 'anchorOrgUnitId is required' }, { status: 422 });
  }

  const parsed = setPersonPasswordRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/people/${personId}/password?anchorOrgUnitId=${encodeURIComponent(anchorOrgUnitId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return new NextResponse(null, { status: upstream.status });
}
