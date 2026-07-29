import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createSpeechEvaluationRequestSchema,
  type CreateSpeechEvaluationRequest,
  type SpeechEvaluation,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { SpeechEvaluationRepository } from './speech-evaluation.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M7 Slice 2: system-design.md §10.2, FR-EDU-4/5. `metricsSnapshot` is a placeholder empty snapshot until the live timer/ah-counter record feed is wired in — see the M7 plan doc. */
@Controller('clubs/:clubUnitId/evaluations')
export class SpeechEvaluationController {
  constructor(private readonly evaluations: SpeechEvaluationRepository) {}

  @Post()
  @ResourceScope('education.evaluation', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createSpeechEvaluationRequestSchema))
    body: CreateSpeechEvaluationRequest,
  ): Promise<SpeechEvaluation> {
    return this.evaluations.create({
      ...body,
      orgUnitId: clubUnitId,
      evaluatorPersonId: principal.userId,
      metricsSnapshot: { timer: null, ahCounter: null },
    });
  }

  @Get()
  @ResourceScope('education.evaluation', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<SpeechEvaluation[]> {
    return this.evaluations.findByClub(clubUnitId);
  }

  @Get('mine')
  mine(@CurrentUser() principal: Principal): Promise<SpeechEvaluation[]> {
    return this.evaluations.findAsSpeaker(principal.userId);
  }
}
