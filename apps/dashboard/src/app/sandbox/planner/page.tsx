import { listSandboxPlanner } from '@/lib/sandbox';
import { AddPlannerEntryForm } from '@/components/sandbox/AddPlannerEntryForm';
import { Card, CardContent } from '@/components/ui/card';

export default async function SandboxPlannerPage() {
  const entries = await listSandboxPlanner();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1>Planner</h1>
        <AddPlannerEntryForm />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-medium">{entry.theme}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(entry.meetingDate).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Toastmaster: {entry.toastmaster ?? 'Unassigned'}</p>
                <p>General Evaluator: {entry.generalEvaluator ?? 'Unassigned'}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
