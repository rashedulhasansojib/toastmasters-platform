import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { AccessModule } from '../access/access.module';
import { OrgUnitRepository } from './org.repository';
import { OrgUnitService } from './org.service';
import { OrgUnitController } from './org.controller';

@Module({
  imports: [AccessModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    OrgUnitRepository,
    OrgUnitService,
  ],
  controllers: [OrgUnitController],
  exports: [OrgUnitRepository],
})
export class OrgModule {}
