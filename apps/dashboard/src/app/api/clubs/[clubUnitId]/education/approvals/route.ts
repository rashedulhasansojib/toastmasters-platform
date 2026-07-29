import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;
  const status = new URL(request.url).searchParams.get('status');
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/education/approvals${qs}`);
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
