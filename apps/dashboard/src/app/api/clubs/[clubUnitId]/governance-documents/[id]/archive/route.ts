import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; id: string }> },
): Promise<NextResponse> {
  const { clubUnitId, id } = await params;
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/governance-documents/${id}/archive`, {
    method: 'POST',
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
