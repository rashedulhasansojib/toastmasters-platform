import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { MeetingModule } from '../meeting/meeting.module';
import { IdentityModule } from '../identity/identity.module';
import { SupportProfileRepository } from './support-profile.repository';
import { SupportProfileController } from './support-profile.controller';
import { SupportRequestRepository } from './support-request.repository';
import { SupportRequestService } from './support-request.service';
import { SupportRequestController } from './support-request.controller';

@Module({
  imports: [MeetingModule, IdentityModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    SupportProfileRepository,
    SupportRequestRepository,
    SupportRequestService,
  ],
  controllers: [SupportProfileController, SupportRequestController],
})
export class SupportModule {}
