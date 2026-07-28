import { NextResponse } from 'next/server';
import { decideSpeechSlotRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string; speechSlotId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId, speechSlotId } = await params;

  const parsed = decideSpeechSlotRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/speech-slots/${speechSlotId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
