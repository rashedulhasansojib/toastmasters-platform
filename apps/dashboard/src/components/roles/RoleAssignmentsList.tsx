import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { MeetingRoleAssignment } from '@toastmasters/contracts';
import { MEETING_ROLE_KEYS } from './roleKeys';
import { RoleAssignmentActions } from './RoleAssignmentActions';

function assigneeLabel(assignment: MeetingRoleAssignment): string {
  switch (assignment.assignee.kind) {
    case 'member':
      return assignment.assignee.personId;
    case 'cross_club':
      return `${assignment.assignee.personId} (cross-club)`;
    case 'unfilled':
      return 'Unfilled';
  }
}

export function RoleAssignmentsList({
  clubUnitId,
  meetingId,
  assignments,
}: {
  clubUnitId: string;
  meetingId: string;
  assignments: MeetingRoleAssignment[];
}) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">No roles assigned yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {assignments.map((assignment, i) => (
          <div key={assignment.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">
                  {MEETING_ROLE_KEYS.find((r) => r.value === assignment.roleKey)?.label ??
                    assignment.roleKey}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {assigneeLabel(assignment)} — {assignment.status}
                </span>
                {assignment.declinedReason && (
                  <p className="text-sm text-muted-foreground">
                    Reason: {assignment.declinedReason}
                  </p>
                )}
              </div>
              {assignment.status === 'proposed' && (
                <RoleAssignmentActions
                  clubUnitId={clubUnitId}
                  meetingId={meetingId}
                  roleAssignmentId={assignment.id}
                />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
