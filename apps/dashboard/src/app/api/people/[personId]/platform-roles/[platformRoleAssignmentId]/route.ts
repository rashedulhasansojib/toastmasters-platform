import { NextResponse } from 'next/server';
import { authedFetch } from '@/lib/session-proxy';

/** Users admin: revoke a platform role. See the sibling route's note on why there's no `anchorOrgUnitId`. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string; platformRoleAssignmentId: string }> },
): Promise<NextResponse> {
  const { personId, platformRoleAssignmentId } = await params;
  const upstream = await authedFetch(
    `/v1/people/${personId}/platform-roles/${platformRoleAssignmentId}`,
    { method: 'DELETE' },
  );
  return new NextResponse(null, { status: upstream.status });
}
