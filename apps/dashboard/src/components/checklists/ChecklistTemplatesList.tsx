import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ChecklistTemplate } from '@toastmasters/contracts';

export function ChecklistTemplatesList({ templates }: { templates: ChecklistTemplate[] }) {
  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No checklists yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {templates.map((template, i) => (
          <div key={template.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between">
              <span className="font-medium">{template.name}</span>
              <span className="text-sm text-muted-foreground">
                {template.appliesTo} · {template.items.length} items
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
