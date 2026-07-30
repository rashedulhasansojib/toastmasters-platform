import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/**
 * Client-callable counterpart to lib/org-tree.ts's server-only
 * getOrgTreeLevel() — the Add User dialog's cascade picker runs in a client
 * component and needs to fetch one tier at a time as the admin picks.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ regionUnitId: string }> },
): Promise<NextResponse> {
  const { regionUnitId } = await params;
  const search = new URL(request.url).searchParams.toString();
  const upstream = await authedFetch(
    `/v1/platform/${regionUnitId}/org-tree${search ? `?${search}` : ''}`,
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
