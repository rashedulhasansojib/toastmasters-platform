import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const upstream = await authedFetch(`/v1/invitations/${id}/revoke`, { method: 'POST' });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
