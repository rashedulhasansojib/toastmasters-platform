import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { ClubSuccessPlanRepository } from './club-success-plan.repository';
import { ClubSuccessPlanController } from './club-success-plan.controller';

@Module({
  providers: [{ provide: PRISMA_CLIENT, useFactory: () => getPrisma() }, ClubSuccessPlanRepository],
  controllers: [ClubSuccessPlanController],
  exports: [ClubSuccessPlanRepository],
})
export class GovernanceModule {}
