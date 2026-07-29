import type { ClubHealthSnapshot } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function HealthSnapshotsList({ snapshots }: { snapshots: ClubHealthSnapshot[] }) {
  if (snapshots.length === 0) {
    return <p className="text-sm text-muted-foreground">No health snapshots yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {snapshots.map((s, i) => (
          <div key={s.id}>
            {i > 0 && <Separator className="mb-3" />}
            <p className="font-medium">{s.yearMonth}</p>
            <p className="text-sm text-muted-foreground">
              {s.meetingsHeld} meetings · {s.memberCount} members · {s.guestCount} guests ·{' '}
              {s.rolesFilledPct.toFixed(0)}% roles filled · {s.speechesGiven} speeches
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
