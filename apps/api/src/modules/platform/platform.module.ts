import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { OrgModule } from '../org/org.module';
import { PlatformConsoleRepository } from './platform-console.repository';
import { PlatformConsoleService } from './platform-console.service';
import { PlatformConsoleController } from './platform-console.controller';

/**
 * The platform-tier admin console. A new module rather than a home in an
 * existing context (CLAUDE.md §4: "new module only if no context fits") —
 * the console spans org, identity and access, so none of the three owns it.
 * It reuses their repositories rather than re-implementing their queries.
 */
@Module({
  imports: [OrgModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    PlatformConsoleRepository,
    PlatformConsoleService,
  ],
  controllers: [PlatformConsoleController],
})
export class PlatformModule {}
