import { listSandboxMeetings } from '@/lib/sandbox';
import { AddMeetingForm } from '@/components/sandbox/AddMeetingForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function SandboxMeetingsPage() {
  const meetings = await listSandboxMeetings();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>Meetings</h1>
        <AddMeetingForm />
      </div>
      <div className="flex flex-col gap-4">
        {meetings.map((meeting) => (
          <Card key={meeting.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {meeting.theme}
                <Badge variant={meeting.status === 'completed' ? 'secondary' : 'outline'}>
                  {meeting.status === 'completed' ? 'Completed' : 'Upcoming'}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(meeting.scheduledAt).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {meeting.agenda.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.order}. {item.title}
                    {item.speaker ? ` — ${item.speaker}` : ''}
                  </span>
                  <span className="text-muted-foreground">{item.durationMinutes} min</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
