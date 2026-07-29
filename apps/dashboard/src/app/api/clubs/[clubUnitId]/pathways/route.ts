import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/** The seeded Pathways catalogue, for the agenda's path/project pickers. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/pathways`);
  return NextResponse.json(await upstream.json().catch(() => []), { status: upstream.status });
}
