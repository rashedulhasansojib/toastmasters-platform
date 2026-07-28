import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { OrgUnitRepository } from './org.repository';

@Module({
  providers: [{ provide: PRISMA_CLIENT, useFactory: () => getPrisma() }, OrgUnitRepository],
  exports: [OrgUnitRepository],
})
export class OrgModule {}
