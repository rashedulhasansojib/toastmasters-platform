import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Ballot } from '@toastmasters/contracts';
import { BallotCard } from './BallotCard';

export function BallotsList({
  clubUnitId,
  meetingId,
  ballots,
}: {
  clubUnitId: string;
  meetingId: string;
  ballots: Ballot[];
}) {
  if (ballots.length === 0) {
    return <p className="text-sm text-muted-foreground">No ballots yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {ballots.map((ballot, i) => (
          <div key={ballot.id}>
            {i > 0 && <Separator className="mb-3" />}
            <BallotCard clubUnitId={clubUnitId} meetingId={meetingId} ballot={ballot} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
