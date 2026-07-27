import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import type { HealthResponse } from '@toastmasters/contracts';
import { Public } from '../common/auth/public.decorator';
import { HealthService } from './health.service';

// Version-neutral: /health is not part of the versioned (/v1) API surface.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check(): HealthResponse {
    return this.health.liveness();
  }
}
