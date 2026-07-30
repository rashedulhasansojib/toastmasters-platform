import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/** Thin proxy so the client-side UnitSwitcher can back the VPM landing redirect after a unit switch. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/role-assignments/mine`);
  return NextResponse.json(await upstream.json().catch(() => []), { status: upstream.status });
}
