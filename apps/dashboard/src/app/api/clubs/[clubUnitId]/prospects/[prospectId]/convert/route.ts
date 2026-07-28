import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; prospectId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, prospectId } = await params;

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/prospects/${prospectId}/convert`, {
    method: 'POST',
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
