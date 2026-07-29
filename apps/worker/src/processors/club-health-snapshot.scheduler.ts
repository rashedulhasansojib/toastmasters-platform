import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { CLUB_HEALTH_SNAPSHOT_QUEUE } from './club-health-snapshot.processor';

/** Monthly on the 1st at 04:00 — after the DCP projection job (03:00). */
@Injectable()
export class ClubHealthSnapshotScheduler implements OnModuleInit {
  constructor(@InjectQueue(CLUB_HEALTH_SNAPSHOT_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'monthly-snapshot',
      {},
      { repeat: { pattern: '0 4 1 * *' }, removeOnComplete: true, removeOnFail: 100 },
    );
  }
}
