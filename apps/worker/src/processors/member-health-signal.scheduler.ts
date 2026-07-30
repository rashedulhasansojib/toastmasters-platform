import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MEMBER_HEALTH_SIGNAL_QUEUE } from './member-health-signal.processor';

/** Nightly at 05:00 — after DCP projection (03:00), before club-health-snapshot's monthly run. */
@Injectable()
export class MemberHealthSignalScheduler implements OnModuleInit {
  constructor(@InjectQueue(MEMBER_HEALTH_SIGNAL_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'nightly-recompute',
      {},
      { repeat: { pattern: '0 5 * * *' }, removeOnComplete: true, removeOnFail: 100 },
    );
  }
}
