import { NextResponse } from 'next/server';
import { publicGuestRegistrationRequestSchema } from '@toastmasters/contracts';
import { callApi } from '@/lib/session-proxy';

/** M4 Slice 10: guest-facing, no session — `callApi`, not `authedFetch` (there is no cookie to forward). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const parsed = publicGuestRegistrationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await callApi(`/v1/public/capability-tokens/${token}/guest-registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
