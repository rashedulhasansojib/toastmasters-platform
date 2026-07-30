import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
): Promise<NextResponse> {
  const { personId } = await params;
  const anchorOrgUnitId = new URL(request.url).searchParams.get('anchorOrgUnitId');
  if (!anchorOrgUnitId) {
    return NextResponse.json({ message: 'anchorOrgUnitId is required' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/people/${personId}/restore?anchorOrgUnitId=${encodeURIComponent(anchorOrgUnitId)}`,
    { method: 'POST' },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
