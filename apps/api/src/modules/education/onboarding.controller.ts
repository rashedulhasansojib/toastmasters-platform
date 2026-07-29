import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createOnboardingTrackRequestSchema,
  enrollOnboardingRequestSchema,
  completeOnboardingStepRequestSchema,
  type CreateOnboardingTrackRequest,
  type EnrollOnboardingRequest,
  type CompleteOnboardingStepRequest,
  type OnboardingTrack,
  type OnboardingProgress,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { OnboardingTrackRepository } from './onboarding-track.repository';
import { OnboardingProgressRepository } from './onboarding-progress.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M7 Slice 4: system-design.md §10.4, FR-EDU-7. `education.onboarding` covers tracks and progress. */
@Controller('clubs/:clubUnitId/onboarding-tracks')
export class OnboardingTrackController {
  constructor(private readonly tracks: OnboardingTrackRepository) {}

  @Post()
  @ResourceScope('education.onboarding', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createOnboardingTrackRequestSchema))
    body: CreateOnboardingTrackRequest,
  ): Promise<OnboardingTrack> {
    return this.tracks.create({ orgUnitId: clubUnitId, ...body });
  }

  @Get()
  @ResourceScope('education.onboarding', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<OnboardingTrack[]> {
    return this.tracks.findByClub(clubUnitId);
  }
}

@Controller('clubs/:clubUnitId/onboarding-progress')
export class OnboardingProgressController {
  constructor(private readonly progress: OnboardingProgressRepository) {}

  @Post()
  @ResourceScope('education.onboarding', 'create', { source: 'param', key: 'clubUnitId' })
  enroll(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(enrollOnboardingRequestSchema)) body: EnrollOnboardingRequest,
  ): Promise<OnboardingProgress> {
    return this.progress.enroll({ orgUnitId: clubUnitId, ...body });
  }

  @Get()
  @ResourceScope('education.onboarding', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query('personId') personId?: string,
  ): Promise<OnboardingProgress[]> {
    return this.progress.findByClub(clubUnitId, personId);
  }

  @Post(':id/steps/:key/complete')
  @ResourceScope('education.onboarding', 'update', { source: 'param', key: 'clubUnitId' })
  completeStep(
    @Param('id', uuidPipe) id: string,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(completeOnboardingStepRequestSchema))
    body: CompleteOnboardingStepRequest,
  ): Promise<OnboardingProgress> {
    return this.progress.completeStep(id, key, body.note);
  }
}
