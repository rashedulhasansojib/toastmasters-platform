import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { ProspectRepository } from './prospect.repository';
import { ProspectService } from './prospect.service';
import { ProspectController } from './prospect.controller';
import { ProspectVisitRepository } from './prospect-visit.repository';
import { ProspectVisitController } from './prospect-visit.controller';
import { ProspectCommunicationRepository } from './prospect-communication.repository';
import { ProspectCommunicationController } from './prospect-communication.controller';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    ProspectRepository,
    ProspectService,
    ProspectVisitRepository,
    ProspectCommunicationRepository,
  ],
  controllers: [ProspectController, ProspectVisitController, ProspectCommunicationController],
})
export class MembershipModule {}
