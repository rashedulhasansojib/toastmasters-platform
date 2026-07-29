import { NextResponse } from 'next/server';
import { updateMeetingTemplateRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

type Params = { params: Promise<{ clubUnitId: string; templateId: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const { clubUnitId, templateId } = await params;

  const parsed = updateMeetingTemplateRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meeting-templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { clubUnitId, templateId } = await params;

  const upstream = await authedFetch(`/v1/clubs/${clubUnitId}/meeting-templates/${templateId}`, {
    method: 'DELETE',
  });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
