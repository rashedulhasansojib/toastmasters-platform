import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { AgendaItem } from '@toastmasters/contracts';

export function AgendaItemsList({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No agenda items yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={item.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between">
              <div>
                <span className="mr-2 text-sm text-muted-foreground">{item.position}.</span>
                <span className="font-medium">{item.title}</span>
                {item.roleKey && (
                  <span className="ml-2 text-sm text-muted-foreground">— {item.roleKey}</span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {Math.round(item.plannedDurationSeconds / 60)} min
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
