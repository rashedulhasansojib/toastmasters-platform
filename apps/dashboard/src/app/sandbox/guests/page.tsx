import { listSandboxGuests } from '@/lib/sandbox';
import { AddGuestForm } from '@/components/sandbox/AddGuestForm';
import { GuestStatusButtons } from '@/components/sandbox/GuestStatusButtons';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_LABEL = {
  new: 'New',
  invited: 'Invited',
  visited: 'Visited',
  converted: 'Converted',
} as const;

export default async function SandboxGuestsPage() {
  const guests = await listSandboxGuests();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>Guests</h1>
        <AddGuestForm />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {guests.map((guest) => (
            <div
              key={guest.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-medium">{guest.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {guest.email ?? 'No email on file'}
                  {guest.invitedBy ? ` · Invited by ${guest.invitedBy}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={guest.pipelineStatus === 'converted' ? 'secondary' : 'outline'}>
                  {STATUS_LABEL[guest.pipelineStatus]}
                </Badge>
                <GuestStatusButtons guestId={guest.id} status={guest.pipelineStatus} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
