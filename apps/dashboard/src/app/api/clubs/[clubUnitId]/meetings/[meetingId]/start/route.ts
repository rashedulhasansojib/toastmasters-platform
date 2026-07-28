import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId } = await params;
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/start`, {
    method: 'POST',
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
