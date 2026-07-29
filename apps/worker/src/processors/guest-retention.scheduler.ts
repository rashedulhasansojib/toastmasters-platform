import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { GUEST_RETENTION_QUEUE } from './guest-retention.processor';

/** Registers the nightly repeatable job. BullMQ dedupes repeatable jobs by name + pattern, so re-registering on every worker boot is safe. */
@Injectable()
export class GuestRetentionScheduler implements OnModuleInit {
  constructor(@InjectQueue(GUEST_RETENTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'nightly-redact',
      {},
      { repeat: { pattern: '0 2 * * *' }, removeOnComplete: true, removeOnFail: 100 },
    );
  }
}
