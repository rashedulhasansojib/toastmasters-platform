import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { ClubHealthSnapshot } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { ClubHealthSnapshotRepository } from './club-health-snapshot.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M6 Slice 4: system-design.md §19.4. Club-level aggregate only — never member detail (FR-OVS-3). Read-only; the monthly worker job is the only writer. */
@Controller('clubs/:clubUnitId/health-snapshots')
export class ClubHealthSnapshotController {
  constructor(private readonly snapshots: ClubHealthSnapshotRepository) {}

  @Get()
  @ResourceScope('quality.health_snapshot', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<ClubHealthSnapshot[]> {
    return this.snapshots.findByClub(clubUnitId);
  }
}
