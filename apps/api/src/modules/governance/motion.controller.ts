import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createMotionRequestSchema,
  recordMotionVoteRequestSchema,
  type CreateMotionRequest,
  type RecordMotionVoteRequest,
  type Motion,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MotionRepository } from './motion.repository';
import { MotionService } from './motion.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M8 Slice 2: system-design.md §13.2, FR-GOV-2. Attributable votes — the opposite of M3's anonymous award ballots. */
@Controller('clubs/:clubUnitId/excom-meetings/:excomMeetingId/motions')
export class MotionController {
  constructor(
    private readonly motions: MotionRepository,
    private readonly motionService: MotionService,
  ) {}

  @Post()
  @ResourceScope('governance.motion', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('excomMeetingId', uuidPipe) excomMeetingId: string,
    @Body(new ZodValidationPipe(createMotionRequestSchema)) body: CreateMotionRequest,
  ): Promise<Motion> {
    return this.motions.create({ excomMeetingId, ...body });
  }

  @Get()
  @ResourceScope('governance.motion', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('excomMeetingId', uuidPipe) excomMeetingId: string): Promise<Motion[]> {
    return this.motions.findByMeeting(excomMeetingId);
  }

  @Post(':id/vote')
  @ResourceScope('governance.motion', 'update', { source: 'param', key: 'clubUnitId' })
  recordVote(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(recordMotionVoteRequestSchema)) body: RecordMotionVoteRequest,
  ): Promise<Motion> {
    return this.motionService.recordVote(id, body.method, body.record, body.effectiveFrom);
  }

  @Post(':id/withdraw')
  @ResourceScope('governance.motion', 'update', { source: 'param', key: 'clubUnitId' })
  withdraw(@Param('id', uuidPipe) id: string): Promise<Motion> {
    return this.motions.withdraw(id);
  }
}
