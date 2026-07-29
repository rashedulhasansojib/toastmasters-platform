import { NextResponse } from 'next/server';
import { publishContentPlanItemRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; id: string }> },
): Promise<NextResponse> {
  const { clubUnitId, id } = await params;
  const parsed = publishContentPlanItemRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: 'Invalid request' }, { status: 422 });

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/content-plan/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
