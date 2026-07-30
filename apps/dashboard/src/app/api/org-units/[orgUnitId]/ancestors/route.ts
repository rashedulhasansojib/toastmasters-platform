import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgUnitId: string }> },
): Promise<NextResponse> {
  const { orgUnitId } = await params;
  const upstream = await authedFetch(`/v1/org-units/${orgUnitId}/ancestors`);
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
