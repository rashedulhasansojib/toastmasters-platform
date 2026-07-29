import { NextResponse } from 'next/server';
import { createOrgUnitChildRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/** `orgUnitId` is the *parent* here — Next requires one param name per segment, and the sibling route uses it for the unit itself. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgUnitId: string }> },
): Promise<NextResponse> {
  const { orgUnitId } = await params;

  const parsed = createOrgUnitChildRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/org-units/${orgUnitId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
