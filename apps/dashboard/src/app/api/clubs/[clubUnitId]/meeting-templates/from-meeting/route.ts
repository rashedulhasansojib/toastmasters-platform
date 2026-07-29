import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authedFetch } from '@/lib/session-proxy';

/** Mirrors the API controller's inline snapshot schema — "save this meeting as a template". */
const snapshotRequestSchema = z
  .object({ meetingId: z.uuid(), name: z.string().min(1).max(100) })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string }> },
): Promise<NextResponse> {
  const { clubUnitId } = await params;

  const parsed = snapshotRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meeting-templates/from-meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
