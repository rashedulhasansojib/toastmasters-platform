import { NextResponse } from 'next/server';
import { recordMeetingAttendanceRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/** Append-only: the client POSTs correcting rows, so there is no PATCH here. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId } = await params;

  const parsed = recordMeetingAttendanceRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
