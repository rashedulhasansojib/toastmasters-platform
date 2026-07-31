import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AccessModule } from '../access/access.module';
import { SandboxController } from './sandbox.controller';
import { SandboxGuard } from './sandbox.guard';
import { SandboxService } from './sandbox.service';

/**
 * The demo-signup sandbox (platform dashboard QR/link). Deliberately has no
 * `*.repository.ts` — unlike every other module, nothing here touches
 * Prisma. SandboxService's in-memory working copy is the entire
 * persistence layer, by product decision: a person who signs up through the
 * public link has no club, and nothing they click in the sandbox may ever
 * reach real club data. This is an intentional, narrow deviation from the
 * module shape in CLAUDE.md §4, in the same spirit as the guest
 * capability-token flow being "not RBAC" — see SandboxGuard's comment for
 * the actual access gate this module relies on instead of authorize().
 */
@Module({
  imports: [IdentityModule, AccessModule],
  controllers: [SandboxController],
  providers: [SandboxGuard, SandboxService],
})
export class SandboxModule {}
