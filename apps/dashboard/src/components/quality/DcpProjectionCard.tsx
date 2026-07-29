import type { DcpProjection } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';

/** FR-TI-4: always rendered with a "Projected" label, never as official. */
export function DcpProjectionCard({ projection }: { projection: DcpProjection | null }) {
  if (!projection) {
    return <p className="text-sm text-muted-foreground">No DCP projection computed yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-muted-foreground">
          Projected — official status from TI · computed{' '}
          {new Date(projection.computedAt).toLocaleString()}
        </p>
        <p className="text-lg font-medium capitalize">
          {projection.projectedLevel.replaceAll('_', ' ')}
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {projection.goals.map((goal) => (
            <div key={goal.goalNumber} className="flex items-center justify-between gap-2">
              <span>
                Goal {goal.goalNumber} — {goal.label}
              </span>
              <span className={goal.achieved ? 'text-green-600' : 'text-muted-foreground'}>
                {goal.dataSource === 'not_yet_tracked'
                  ? 'not tracked yet'
                  : `${goal.achievedCount}/${goal.targetCount}`}
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm">
          Membership qualifier: {projection.membershipQualifierMet ? 'met' : 'not met'} · Club
          Success Plan qualifier: {projection.clubSuccessPlanQualifierMet ? 'met' : 'not met'}
        </p>
      </CardContent>
    </Card>
  );
}
