import { Global, Module } from '@nestjs/common';
import { AuthzService } from './authz.service';

/**
 * The authorization engine. Global so the ResourceGuard and any future access
 * inspector endpoint can inject it. Permission logic lives only here and in the
 * access module (CLAUDE.md).
 */
@Global()
@Module({
  providers: [AuthzService],
  exports: [AuthzService],
})
export class AuthzModule {}
