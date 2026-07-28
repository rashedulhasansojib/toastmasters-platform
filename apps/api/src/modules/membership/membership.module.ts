import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { IdentityModule } from '../identity/identity.module';
import { ProspectRepository } from './prospect.repository';
import { ProspectService } from './prospect.service';
import { ProspectController } from './prospect.controller';
import { ProspectVisitRepository } from './prospect-visit.repository';
import { ProspectVisitController } from './prospect-visit.controller';
import { ProspectCommunicationRepository } from './prospect-communication.repository';
import { ProspectCommunicationController } from './prospect-communication.controller';
import { ProspectConversionService } from './prospect-conversion.service';

@Module({
  imports: [IdentityModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    ProspectRepository,
    ProspectService,
    ProspectVisitRepository,
    ProspectCommunicationRepository,
    ProspectConversionService,
  ],
  controllers: [ProspectController, ProspectVisitController, ProspectCommunicationController],
})
export class MembershipModule {}
