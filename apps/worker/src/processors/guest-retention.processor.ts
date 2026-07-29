import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@toastmasters/db';

export const GUEST_RETENTION_QUEUE = 'guest-retention';

/**
 * M4 Slice 3: enforces CLAUDE.md §2 decision 4 (180-day guest PII retention)
 * as a scheduled job, not aspiration. Anonymises rather than deletes — see the
 * schema comment on `Guest.piiRedactedAt` — so `GuestVisit`/
 * `GuestCommunication` rows and lead-source aggregates survive.
 * A `joined` guest is a converted member now tracked under `Person`'s own
 * retention rules, so it is excluded here.
 */
@Processor(GUEST_RETENTION_QUEUE)
export class GuestRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(GuestRetentionProcessor.name);

  async process(_job: Job): Promise<{ redacted: number }> {
    const db = getPrisma();
    const now = new Date();
    const result = await db.guest.updateMany({
      where: {
        deleteAfter: { lt: now },
        pipelineStatus: { not: 'joined' },
        piiRedactedAt: null,
      },
      data: {
        fullName: '[redacted]',
        email: null,
        phone: null,
        whatsapp: null,
        photoUrl: null,
        bio: null,
        piiRedactedAt: now,
      },
    });
    this.logger.log({ redacted: result.count }, 'guest retention job ran');
    return { redacted: result.count };
  }
}
