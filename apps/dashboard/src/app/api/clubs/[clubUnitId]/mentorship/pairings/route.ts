import { NextResponse } from 'next/server';
import { createMentorshipPairingRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;
  const parsed = createMentorshipPairingRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: 'Invalid request' }, { status: 422 });

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/mentorship/pairings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
