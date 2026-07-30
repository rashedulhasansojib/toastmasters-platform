import type { MemberHealthBand } from '@toastmasters/contracts';

import { cn } from '@/lib/utils';
import { BAND_ACCENT, BAND_CHIP, BAND_LABEL } from './bands';

export function HealthBandBadge({
  band,
  className,
}: {
  band: MemberHealthBand;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        BAND_CHIP[band],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', BAND_ACCENT[band])} />
      {BAND_LABEL[band]}
    </span>
  );
}
