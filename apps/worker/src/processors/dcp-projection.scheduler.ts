import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DCP_PROJECTION_QUEUE } from './dcp-projection.processor';

/** Nightly at 03:00 — after the prospect-retention job (02:00), before club-health-snapshot's monthly run. */
@Injectable()
export class DcpProjectionScheduler implements OnModuleInit {
  constructor(@InjectQueue(DCP_PROJECTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'nightly-recompute',
      {},
      { repeat: { pattern: '0 3 * * *' }, removeOnComplete: true, removeOnFail: 100 },
    );
  }
}
