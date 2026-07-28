import { NextResponse } from 'next/server';
import { createAgendaItemRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/** M3 Slice 2: thin BFF proxy, same shape as the auth routes but no cookie to reissue — a plain data mutation. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId } = await params;

  const parsed = createAgendaItemRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/agenda-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
