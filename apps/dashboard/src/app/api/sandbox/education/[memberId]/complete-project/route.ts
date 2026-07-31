import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
): Promise<NextResponse> {
  const { memberId } = await params;

  const upstream = await authedFetch(`/v1/sandbox/education/${memberId}/complete-project`, {
    method: 'POST',
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
