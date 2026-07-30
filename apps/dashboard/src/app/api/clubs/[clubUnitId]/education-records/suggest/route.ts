import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;
  const personId = new URL(request.url).searchParams.get('personId');
  if (!personId) return NextResponse.json({ message: 'personId is required' }, { status: 422 });

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/education-records/suggest?personId=${encodeURIComponent(personId)}`,
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
