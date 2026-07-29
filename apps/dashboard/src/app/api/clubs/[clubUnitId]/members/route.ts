import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/** Read-through for the client-side member pickers on the meeting page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/members`);
  return NextResponse.json(await upstream.json().catch(() => []), { status: upstream.status });
}
