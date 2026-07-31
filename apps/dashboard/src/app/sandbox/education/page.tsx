import { listSandboxEducation } from '@/lib/sandbox';
import { CompleteProjectButton } from '@/components/sandbox/CompleteProjectButton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function SandboxEducationPage() {
  const records = await listSandboxEducation();

  return (
    <div className="flex flex-col gap-4">
      <h1>Education</h1>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {records.map((record) => (
            <div
              key={record.memberId}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-medium">{record.memberName}</p>
                <p className="text-sm text-muted-foreground">
                  {record.pathway} · Level {record.level}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">
                  {record.projectsCompleted}/{record.projectsTotal} projects
                </Badge>
                <CompleteProjectButton
                  memberId={record.memberId}
                  disabled={record.projectsCompleted >= record.projectsTotal}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
