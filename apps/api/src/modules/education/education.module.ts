import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { IdentityModule } from '../identity/identity.module';
import { EducationRecordRepository } from './education-record.repository';
import { EducationRecordService } from './education-record.service';
import { EducationRecordController } from './education-record.controller';
import { EducationProgressRepository } from './education-progress.repository';
import { EducationProgressService } from './education-progress.service';
import { EducationProgressController } from './education-progress.controller';
import { SpeechApprovalRepository } from './speech-approval.repository';
import { SpeechEvaluationRepository } from './speech-evaluation.repository';
import { SpeechEvaluationController } from './speech-evaluation.controller';
import { MentorAvailabilityRepository } from './mentor-availability.repository';
import { MentorshipPairingRepository } from './mentorship-pairing.repository';
import { MentorshipService } from './mentorship.service';
import { MentorshipController } from './mentorship.controller';
import { OnboardingTrackRepository } from './onboarding-track.repository';
import { OnboardingProgressRepository } from './onboarding-progress.repository';
import { OnboardingTrackController, OnboardingProgressController } from './onboarding.controller';

@Module({
  imports: [IdentityModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    EducationRecordRepository,
    EducationRecordService,
    EducationProgressRepository,
    EducationProgressService,
    SpeechApprovalRepository,
    SpeechEvaluationRepository,
    MentorAvailabilityRepository,
    MentorshipPairingRepository,
    MentorshipService,
    OnboardingTrackRepository,
    OnboardingProgressRepository,
  ],
  controllers: [
    EducationRecordController,
    EducationProgressController,
    SpeechEvaluationController,
    MentorshipController,
    OnboardingTrackController,
    OnboardingProgressController,
  ],
  exports: [EducationRecordRepository, SpeechApprovalRepository],
})
export class EducationModule {}
