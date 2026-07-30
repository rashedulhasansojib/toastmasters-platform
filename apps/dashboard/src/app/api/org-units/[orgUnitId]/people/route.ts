import { NextResponse } from 'next/server';
import { createPersonRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgUnitId: string }> },
): Promise<NextResponse> {
  const { orgUnitId } = await params;
  const search = new URL(request.url).searchParams.toString();
  const upstream = await authedFetch(
    `/v1/org-units/${orgUnitId}/people${search ? `?${search}` : ''}`,
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgUnitId: string }> },
): Promise<NextResponse> {
  const { orgUnitId } = await params;

  const parsed = createPersonRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/org-units/${orgUnitId}/people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
