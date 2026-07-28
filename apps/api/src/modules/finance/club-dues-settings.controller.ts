import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import {
  updateClubDuesSettingsRequestSchema,
  type UpdateClubDuesSettingsRequest,
  type ClubDuesSettings,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { ClubDuesSettingsRepository } from './club-dues-settings.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 6 / CLAUDE.md §2 decision 7: the club's flat semiannual dues rates — Treasurer-set, read at DuesRecord-generation time. */
@Controller('clubs/:clubUnitId/dues-settings')
export class ClubDuesSettingsController {
  constructor(private readonly settings: ClubDuesSettingsRepository) {}

  @Get()
  @ResourceScope('finance.dues', 'read', { source: 'param', key: 'clubUnitId' })
  find(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<ClubDuesSettings> {
    return this.settings.find(clubUnitId);
  }

  @Patch()
  @ResourceScope('finance.dues', 'update', { source: 'param', key: 'clubUnitId' })
  update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(updateClubDuesSettingsRequestSchema))
    body: UpdateClubDuesSettingsRequest,
  ): Promise<ClubDuesSettings> {
    return this.settings.update(clubUnitId, body);
  }
}
