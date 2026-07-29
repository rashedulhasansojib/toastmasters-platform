import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  publicGuestRegistrationRequestSchema,
  type PublicGuestRegistrationRequest,
  type Guest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/auth/public.decorator';
import { PublicGuestRegistrationService } from './public-guest-registration.service';

/** M4 Slice 10: guest-facing, no session — matching CapabilityTokenController's `verify` split between authenticated issue/revoke and public redemption. */
@Controller('public/capability-tokens')
export class PublicGuestRegistrationController {
  constructor(private readonly registration: PublicGuestRegistrationService) {}

  @Public()
  @Post(':token/guest-registration')
  register(
    // The token is a random base64url string, not a UUID (unlike every
    // other :id param in this codebase) — plain string param, matching
    // CapabilityTokenController.verify's own raw-token handling.
    @Param('token') token: string,
    @Body(new ZodValidationPipe(publicGuestRegistrationRequestSchema))
    body: PublicGuestRegistrationRequest,
  ): Promise<Guest> {
    return this.registration.register(token, body);
  }
}
