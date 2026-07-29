import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  setSupportProfileRequestSchema,
  type SetSupportProfileRequest,
  type SupportProfile,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { SupportProfileRepository } from './support-profile.repository';

/**
 * M8 Slice 5: system-design.md §17, FR-SUP-1. Self-service only — a
 * person sets their own discoverability, never an officer on their
 * behalf. No @ResourceScope: this isn't a club-scoped resource, it's a
 * global per-person opt-in, same self-referential shape as tickets/mine
 * and evaluations/mine.
 */
@Controller('support-profile')
export class SupportProfileController {
  constructor(private readonly profiles: SupportProfileRepository) {}

  @Post()
  set(
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(setSupportProfileRequestSchema)) body: SetSupportProfileRequest,
  ): Promise<SupportProfile> {
    return this.profiles.upsert({ personId: principal.userId, ...body });
  }

  @Get('mine')
  async mine(@CurrentUser() principal: Principal): Promise<SupportProfile | null> {
    return this.profiles.findByPerson(principal.userId);
  }
}
