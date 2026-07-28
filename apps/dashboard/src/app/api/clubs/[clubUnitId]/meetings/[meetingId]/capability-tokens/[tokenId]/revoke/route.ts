import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string; tokenId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId, tokenId } = await params;
  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/capability-tokens/${tokenId}/revoke`,
    { method: 'PATCH' },
  );
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
