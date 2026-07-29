import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Motion,
  MotionOutcome,
  MotionVoteMethod,
  MotionVoteChoice,
} from '@toastmasters/contracts';
import { MotionRepository } from './motion.repository';

/** M8 Slice 2: system-design.md §13.2, FR-GOV-2. Outcome is derived from the recorded vote, never client-supplied. */
@Injectable()
export class MotionService {
  constructor(private readonly motions: MotionRepository) {}

  async recordVote(
    id: string,
    method: MotionVoteMethod,
    record: Array<{ personId: string; choice: MotionVoteChoice }>,
    effectiveFrom?: string,
  ): Promise<Motion> {
    const motion = await this.motions.findById(id);
    if (!motion) throw new NotFoundException('Motion not found');

    const forCount = record.filter((r) => r.choice === 'for').length;
    const againstCount = record.filter((r) => r.choice === 'against').length;
    const abstainCount = record.filter((r) => r.choice === 'abstain').length;
    const outcome: MotionOutcome = forCount > againstCount ? 'carried' : 'failed';

    return this.motions.recordVote(
      id,
      { method, for: forCount, against: againstCount, abstain: abstainCount, record },
      outcome,
      effectiveFrom ? new Date(effectiveFrom) : undefined,
    );
  }
}
