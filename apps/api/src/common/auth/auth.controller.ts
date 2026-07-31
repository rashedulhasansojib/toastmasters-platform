import { Body, Controller, Get, HttpCode, Ip, Post, Res } from '@nestjs/common';
import {
  loginRequestSchema,
  registerRequestSchema,
  switchUnitRequestSchema,
  type LoginRequest,
  type RegisterRequest,
  type SwitchUnitRequest,
  type SessionResponse,
  type SwitchableUnit,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SignupRateLimiter } from './signup-rate-limiter.service';
import type { Principal } from '../authz/authz.types';

/** Minimal shape for the cookie-setting call — avoids a hard dependency on @types/express (see jwt-auth.guard.ts's RequestLike for the same pattern). */
interface ResponseLike {
  cookie(name: string, value: string, options: object): void;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
    private readonly signupRateLimiter: SignupRateLimiter,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<SessionResponse> {
    const { token, session } = await this.auth.login(body.email, body.password);
    res.cookie('session', token, this.session.cookieOptions());
    return session;
  }

  /** The public sandbox-signup link (platform dashboard QR/link) — see AuthService.register. */
  @Public()
  @Post('register')
  @HttpCode(200)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<SessionResponse> {
    this.signupRateLimiter.checkAndIncrement(ip);
    const { token, session } = await this.auth.register(body);
    res.cookie('session', token, this.session.cookieOptions());
    return session;
  }

  @Post('switch-unit')
  @HttpCode(200)
  async switchUnit(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(switchUnitRequestSchema)) body: SwitchUnitRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<SessionResponse> {
    const { token, session } = await this.auth.switchUnit(principal, body.orgUnitId);
    res.cookie('session', token, this.session.cookieOptions());
    return session;
  }

  @Get('me')
  async me(@CurrentUser() principal: Principal): Promise<SessionResponse> {
    return this.auth.me(principal);
  }

  @Get('switchable-units')
  async switchableUnits(@CurrentUser() principal: Principal): Promise<SwitchableUnit[]> {
    return this.auth.switchableUnits(principal);
  }
}
