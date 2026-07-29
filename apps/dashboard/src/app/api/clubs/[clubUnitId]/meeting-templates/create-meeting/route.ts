import { NextResponse } from 'next/server';
import { createMeetingFromTemplateRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

/** "Create & Build": one call creates the meeting and copies the template's agenda, roles, word of the day and table topics. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;

  const parsed = createMeetingFromTemplateRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meeting-templates/create-meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
