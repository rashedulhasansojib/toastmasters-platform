import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; reportId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, reportId } = await params;

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/financial-reports/${reportId}/finalize`,
    { method: 'POST' },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
