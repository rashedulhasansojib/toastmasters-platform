import { NextResponse } from 'next/server';
import { acceptInvitationRequestSchema } from '@toastmasters/contracts';
import { callApi } from '@/lib/session-proxy';

/**
 * `id` here is the raw invitation token, not a database id — named `id` only
 * to satisfy Next's "same slug name for the same dynamic path" rule, since
 * this segment is a sibling of `[id]/resend` and `[id]/revoke` (those use a
 * real invitation id). @Public() on the API side — no session cookie exists
 * yet, so this forwards via callApi(), not authedFetch().
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: token } = await params;

  const parsed = acceptInvitationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await callApi(`/v1/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
