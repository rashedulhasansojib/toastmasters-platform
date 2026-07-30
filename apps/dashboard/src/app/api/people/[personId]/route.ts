import { NextResponse } from 'next/server';
import { updatePersonRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
): Promise<NextResponse> {
  const { personId } = await params;
  const search = new URL(request.url).searchParams.toString();
  const upstream = await authedFetch(`/v1/people/${personId}${search ? `?${search}` : ''}`);
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
): Promise<NextResponse> {
  const { personId } = await params;
  const anchorOrgUnitId = new URL(request.url).searchParams.get('anchorOrgUnitId');
  if (!anchorOrgUnitId) {
    return NextResponse.json({ message: 'anchorOrgUnitId is required' }, { status: 422 });
  }

  const parsed = updatePersonRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/people/${personId}?anchorOrgUnitId=${encodeURIComponent(anchorOrgUnitId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
