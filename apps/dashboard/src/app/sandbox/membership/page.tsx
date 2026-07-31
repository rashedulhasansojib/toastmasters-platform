import { listSandboxMembers } from '@/lib/sandbox';
import { AddMemberForm } from '@/components/sandbox/AddMemberForm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function SandboxMembershipPage() {
  const members = await listSandboxMembers();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>Membership</h1>
        <AddMemberForm />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-medium">{member.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {member.role} · {member.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{member.pathway}</Badge>
                <Badge variant="outline">Level {member.pathwayLevel}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
