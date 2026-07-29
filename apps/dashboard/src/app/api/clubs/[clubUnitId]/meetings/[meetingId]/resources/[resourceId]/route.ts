import { NextResponse } from 'next/server';
import { updateMeetingResourceRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

type Params = { params: Promise<{ clubUnitId: string; meetingId: string; resourceId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const { clubUnitId, meetingId, resourceId } = await params;

  const parsed = updateMeetingResourceRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/resources/${resourceId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { clubUnitId, meetingId, resourceId } = await params;

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/resources/${resourceId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
