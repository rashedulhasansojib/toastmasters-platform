import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/** Client-fetchable proxy — the assign form re-queries this whenever the chosen roleKey changes. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId } = await params;
  const roleKey = new URL(request.url).searchParams.get('roleKey');
  if (!roleKey) {
    return NextResponse.json({ message: 'roleKey is required' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/suggestions?roleKey=${roleKey}`,
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
