import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Prospect } from '@toastmasters/contracts';

const STATUS_LABEL: Record<Prospect['pipelineStatus'], string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  not_interested: 'Not interested',
  joined: 'Joined',
};

export function ProspectsList({
  clubUnitId,
  prospects,
}: {
  clubUnitId: string;
  prospects: Prospect[];
}) {
  if (prospects.length === 0) {
    return <p className="text-sm text-muted-foreground">No prospects yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {prospects.map((p, i) => (
          <div key={p.id}>
            {i > 0 && <Separator className="mb-3" />}
            <Link
              href={`/clubs/${clubUnitId}/prospects/${p.id}`}
              className="flex items-center justify-between"
            >
              <span className="font-medium">{p.fullName}</span>
              <span className="text-sm text-muted-foreground">
                {STATUS_LABEL[p.pipelineStatus]}
              </span>
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
