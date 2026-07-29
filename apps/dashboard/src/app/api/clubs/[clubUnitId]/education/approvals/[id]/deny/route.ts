import { NextResponse } from 'next/server';
import { denySpeechApprovalRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; id: string }> },
): Promise<NextResponse> {
  const { clubUnitId, id } = await params;
  const parsed = denySpeechApprovalRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: 'A denial reason is required' }, { status: 422 });
  }
  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/education/approvals/${id}/deny`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
