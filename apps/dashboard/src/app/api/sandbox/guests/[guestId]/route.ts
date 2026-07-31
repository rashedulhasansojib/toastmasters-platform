import { NextResponse } from 'next/server';
import { updateSandboxGuestRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ guestId: string }> },
): Promise<NextResponse> {
  const { guestId } = await params;

  const parsed = updateSandboxGuestRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/sandbox/guests/${guestId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
