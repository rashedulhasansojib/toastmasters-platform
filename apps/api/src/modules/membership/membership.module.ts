import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { ProspectRepository } from './prospect.repository';
import { ProspectService } from './prospect.service';
import { ProspectController } from './prospect.controller';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    ProspectRepository,
    ProspectService,
  ],
  controllers: [ProspectController],
})
export class MembershipModule {}
