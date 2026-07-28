import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Meeting } from '@toastmasters/contracts';

export function MeetingsList({
  clubUnitId,
  meetings,
}: {
  clubUnitId: string;
  meetings: Meeting[];
}) {
  if (meetings.length === 0) {
    return <p className="text-sm text-muted-foreground">No meetings yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {meetings.map((meeting, i) => (
          <div key={meeting.id}>
            {i > 0 && <Separator className="mb-3" />}
            <Link
              href={`/clubs/${clubUnitId}/meetings/${meeting.id}`}
              className="flex items-center justify-between"
            >
              <span className="font-medium">{new Date(meeting.scheduledAt).toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">{meeting.status}</span>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
