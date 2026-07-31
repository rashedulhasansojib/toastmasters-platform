import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/**
 * Client-callable counterpart to lib/platform.ts's server-only
 * getPlatformConsole() — the Add User / assign-role org unit picker runs in a
 * client component and fetches the region's whole flat unit tree once, up
 * front, rather than one tier at a time.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ regionUnitId: string }> },
): Promise<NextResponse> {
  const { regionUnitId } = await params;
  const upstream = await authedFetch(`/v1/platform/${regionUnitId}/console`);
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
