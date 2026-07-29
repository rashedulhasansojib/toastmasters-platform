import type { ProspectPipelineStatus } from '@toastmasters/contracts';

import { cn } from '@/lib/utils';
import { STATUS_ACCENT, STATUS_CHIP, STATUS_LABEL } from './pipeline';

export function ProspectStatusBadge({
  status,
  className,
}: {
  status: ProspectPipelineStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_CHIP[status],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', STATUS_ACCENT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
