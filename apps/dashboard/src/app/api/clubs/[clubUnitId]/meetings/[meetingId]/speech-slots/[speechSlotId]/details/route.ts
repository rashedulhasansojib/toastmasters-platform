import { NextResponse } from 'next/server';
import { updateSpeechSlotRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/** M9: edit a prepared speaker in place from the agenda. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; meetingId: string; speechSlotId: string }> },
): Promise<NextResponse> {
  const { clubUnitId, meetingId, speechSlotId } = await params;

  const parsed = updateSpeechSlotRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/speech-slots/${speechSlotId}/details`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
