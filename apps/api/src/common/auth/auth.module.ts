import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '../../modules/identity/identity.module';
import { OrgModule } from '../../modules/org/org.module';
import { AccessModule } from '../../modules/access/access.module';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/** Authentication + session primitives shared across the app (Slice 8; Slice 6 (M2) adds the switcher's queries). */
@Global()
@Module({
  imports: [IdentityModule, OrgModule, AccessModule],
  providers: [PasswordService, SessionService, AuthService],
  controllers: [AuthController],
  exports: [PasswordService, SessionService],
})
export class AuthModule {}
