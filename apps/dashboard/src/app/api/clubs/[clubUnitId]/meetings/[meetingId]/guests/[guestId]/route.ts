import { NextResponse } from 'next/server';
import { updateMeetingGuestRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string; guestId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId, guestId } = await params;

  const parsed = updateMeetingGuestRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/guests/${guestId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string; guestId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId, guestId } = await params;
  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/guests/${guestId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
