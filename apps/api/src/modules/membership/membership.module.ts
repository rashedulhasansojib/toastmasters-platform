import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { IdentityModule } from '../identity/identity.module';
import { MeetingModule } from '../meeting/meeting.module';
import { ProspectRepository } from './prospect.repository';
import { ProspectService } from './prospect.service';
import { ProspectController } from './prospect.controller';
import { ProspectVisitRepository } from './prospect-visit.repository';
import { ProspectVisitController } from './prospect-visit.controller';
import { ProspectCommunicationRepository } from './prospect-communication.repository';
import { ProspectCommunicationController } from './prospect-communication.controller';
import { ProspectConversionService } from './prospect-conversion.service';
import { PublicGuestRegistrationService } from './public-guest-registration.service';
import { PublicGuestRegistrationController } from './public-guest-registration.controller';

@Module({
  imports: [IdentityModule, MeetingModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    ProspectRepository,
    ProspectService,
    ProspectVisitRepository,
    ProspectCommunicationRepository,
    ProspectConversionService,
    PublicGuestRegistrationService,
  ],
  controllers: [
    ProspectController,
    ProspectVisitController,
    ProspectCommunicationController,
    PublicGuestRegistrationController,
  ],
})
export class MembershipModule {}
