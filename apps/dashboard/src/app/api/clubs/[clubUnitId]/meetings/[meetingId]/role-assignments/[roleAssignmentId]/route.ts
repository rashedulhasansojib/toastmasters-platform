import { NextResponse } from 'next/server';
import { updateMeetingRoleAssignmentStatusRequestSchema } from '@toastmasters/contracts';
import { authedFetch } from '@/lib/session-proxy';

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ clubUnitId: string; meetingId: string; roleAssignmentId: string }> },
): Promise<NextResponse> {
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
