import { NextResponse } from 'next/server';
import { completeOnboardingStepRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clubUnitId: string; id: string; key: string }> },
): Promise<NextResponse> {
  const { clubUnitId, id, key } = await params;
  const parsed = completeOnboardingStepRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return NextResponse.json({ message: 'Invalid request' }, { status: 422 });

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/onboarding-progress/${id}/steps/${key}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
