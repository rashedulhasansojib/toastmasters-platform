import { NextResponse } from 'next/server';
import { updateOrgUnitRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgUnitId: string }> },
): Promise<NextResponse> {
  const { orgUnitId } = await params;

  const parsed = updateOrgUnitRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/org-units/${orgUnitId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

/** A 409 body carries `blockers` — the UI surfaces them so the admin knows what to clear. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orgUnitId: string }> },
): Promise<NextResponse> {
  const { orgUnitId } = await params;

  const upstream = await authedFetch(`/v1/org-units/${orgUnitId}`, { method: 'DELETE' });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
