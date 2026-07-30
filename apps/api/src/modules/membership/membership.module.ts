import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { IdentityModule } from '../identity/identity.module';
import { MeetingModule } from '../meeting/meeting.module';
import { GuestRepository } from './guest.repository';
import { GuestService } from './guest.service';
import { GuestController } from './guest.controller';
import { GuestVisitRepository } from './guest-visit.repository';
import { GuestVisitController } from './guest-visit.controller';
import { GuestCommunicationRepository } from './guest-communication.repository';
import { GuestCommunicationController } from './guest-communication.controller';
import { GuestConversionService } from './guest-conversion.service';
import { PublicGuestRegistrationService } from './public-guest-registration.service';
import { PublicGuestRegistrationController } from './public-guest-registration.controller';
import { MemberHealthSignalRepository } from './member-health-signal.repository';
import { MemberHealthController } from './member-health.controller';

@Module({
  imports: [IdentityModule, MeetingModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    GuestRepository,
    GuestService,
    GuestVisitRepository,
    GuestCommunicationRepository,
    GuestConversionService,
    PublicGuestRegistrationService,
    MemberHealthSignalRepository,
  ],
  controllers: [
    GuestController,
    GuestVisitController,
    GuestCommunicationController,
    PublicGuestRegistrationController,
    MemberHealthController,
  ],
})
export class MembershipModule {}
