import { Global, Module } from '@nestjs/common';
import { parseEnv, type Env } from '@toastmasters/config';

/** Injection token for the validated, typed environment. */
export const ENV = Symbol('ENV');

/**
 * Parses and validates the environment exactly once, then exposes it for
 * injection everywhere. We consume @toastmasters/config directly rather than
 * @nestjs/config — the Zod schema is the single source of truth.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => parseEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
