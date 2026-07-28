import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@toastmasters/db';

export const PROSPECT_RETENTION_QUEUE = 'prospect-retention';

/**
 * M4 Slice 3: enforces CLAUDE.md §2 decision 4 (180-day prospect PII retention)
 * as a scheduled job, not aspiration. Anonymises rather than deletes — see the
 * schema comment on `Prospect.piiRedactedAt` — so `ProspectVisit`/
 * `ProspectCommunication` rows and lead-source aggregates survive.
 * A `joined` prospect is a converted member now tracked under `Person`'s own
 * retention rules, so it is excluded here.
 */
@Processor(PROSPECT_RETENTION_QUEUE)
export class ProspectRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(ProspectRetentionProcessor.name);

  async process(_job: Job): Promise<{ redacted: number }> {
    const db = getPrisma();
    const now = new Date();
    const result = await db.prospect.updateMany({
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
    this.logger.log({ redacted: result.count }, 'prospect retention job ran');
    return { redacted: result.count };
  }
}
