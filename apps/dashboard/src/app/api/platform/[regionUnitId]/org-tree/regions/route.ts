import { NextResponse } from 'next/server';
import { createOrgUnitRootRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/** "Add new Region" — proxies to the platform console's region-root creation route. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ regionUnitId: string }> },
): Promise<NextResponse> {
  const { regionUnitId } = await params;

  const parsed = createOrgUnitRootRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/platform/${regionUnitId}/org-tree/regions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
