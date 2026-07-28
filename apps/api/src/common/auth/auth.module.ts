import { Global, Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { IdentityModule } from '../../modules/identity/identity.module';
import { OrgModule } from '../../modules/org/org.module';
import { AccessModule } from '../../modules/access/access.module';
import { PersonRepository } from '../../modules/identity/person.repository';
import { PRISMA_CLIENT } from '../db/prisma-client.token';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/**
 * Authentication + session primitives shared across the app (Slice 8; Slice 6
 * (M2) adds the switcher's queries). `PersonRepository` is registered a
 * second time here (same precedent as `PasswordService` above — stateless,
 * a second instance is harmless) so the global `JwtAuthGuard` — a provider
 * on AppModule itself via APP_GUARD, not a provider of this module — can
 * resolve it (Slice 8 (M2): mid-session permissionVersion check). Nest can't
 * re-export a single provider pulled in through `imports` without also
 * exporting the whole sub-module, which would leak more than needed here.
 */
@Global()
@Module({
  imports: [IdentityModule, OrgModule, AccessModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    PasswordService,
    SessionService,
    AuthService,
    PersonRepository,
  ],
  controllers: [AuthController],
  exports: [PasswordService, SessionService, PersonRepository],
})
export class AuthModule {}
