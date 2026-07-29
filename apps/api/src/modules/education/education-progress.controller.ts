import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { ClubEducationProgressRow } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { EducationProgressService } from './education-progress.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M10: the club's education roster — every member, their path, and their
 * per-level progress.
 *
 * Gated on `education.progress`, not `education.record`: a plain member holds
 * `education.record: read` with condition `own`, and this route returns every
 * member's row, so reusing it would leak the club's whole roster to a
 * self-scoped grant (FR-AUTHZ-8). Club officers only — the Area/Division/
 * District tiers never hold it, because they see counts and projections, not
 * member detail (FR-OVS-3).
 */
@Controller('clubs/:clubUnitId/education')
export class EducationProgressController {
  constructor(private readonly progress: EducationProgressService) {}

  @Get('progress')
  @ResourceScope('education.progress', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<ClubEducationProgressRow[]> {
    return this.progress.listByClub(clubUnitId);
  }
}
