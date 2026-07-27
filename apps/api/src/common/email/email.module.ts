import { Module } from '@nestjs/common';
import { EMAIL_PORT } from './email.port';
import { ConsoleEmailAdapter } from './console-email.adapter';

/**
 * Binds EmailPort to the dev console adapter. A real provider adapter is
 * swapped in for production (behind the same port) when transactional email
 * lands. Inject EMAIL_PORT, never a concrete adapter.
 */
@Module({
  providers: [{ provide: EMAIL_PORT, useClass: ConsoleEmailAdapter }],
  exports: [EMAIL_PORT],
})
export class EmailModule {}
