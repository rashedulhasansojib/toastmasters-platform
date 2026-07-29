import { NextResponse } from 'next/server';
import { updateMeetingRoleAssignmentStatusRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

type Params = {
  params: Promise<{ clubUnitId: string; meetingId: string; roleAssignmentId: string }>;
};

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const { clubUnitId, meetingId, roleAssignmentId } = await params;

  const parsed = updateMeetingRoleAssignmentStatusRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request' }, { status: 422 });
  }

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/${roleAssignmentId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    },
  );
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}

/** Withdraw a still-proposed assignment so the role can be reassigned. */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { clubUnitId, meetingId, roleAssignmentId } = await params;

  const upstream = await authedFetch(
    `/v1/clubs/${clubUnitId}/meetings/${meetingId}/role-assignments/${roleAssignmentId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await upstream.json().catch(() => ({})), { status: upstream.status });
}
