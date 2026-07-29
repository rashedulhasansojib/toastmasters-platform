import { NextResponse } from 'next/server';
import { createTicketRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  if (!scope) return NextResponse.json({ message: 'Missing scope' }, { status: 422 });

  const parsed = createTicketRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: 'Invalid request' }, { status: 422 });

  const upstream = await authedFetch(`/v1/tickets?scope=${encodeURIComponent(scope)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
