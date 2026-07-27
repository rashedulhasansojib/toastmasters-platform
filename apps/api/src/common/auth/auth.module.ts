import { Global, Module } from '@nestjs/common';
import { PasswordService } from './password.service';

/** Authentication primitives shared across the app. */
@Global()
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class AuthModule {}
