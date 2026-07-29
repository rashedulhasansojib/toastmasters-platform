import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { LibraryModule } from '../library/library.module';
import { ClubSuccessPlanRepository } from './club-success-plan.repository';
import { ClubSuccessPlanController } from './club-success-plan.controller';
import { ExComMeetingRepository } from './excom-meeting.repository';
import { ExComMeetingController } from './excom-meeting.controller';
import { MotionRepository } from './motion.repository';
import { MotionService } from './motion.service';
import { MotionController } from './motion.controller';
import { MinutesRepository } from './minutes.repository';
import { MinutesService } from './minutes.service';
import { MinutesController } from './minutes.controller';

@Module({
  imports: [LibraryModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    ClubSuccessPlanRepository,
    ExComMeetingRepository,
    MotionRepository,
    MotionService,
    MinutesRepository,
    MinutesService,
  ],
  controllers: [
    ClubSuccessPlanController,
    ExComMeetingController,
    MotionController,
    MinutesController,
  ],
  exports: [ClubSuccessPlanRepository],
})
export class GovernanceModule {}
