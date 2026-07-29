import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import type { DcpProjection } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { DcpProjectionRepository } from './dcp-projection.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M6 Slice 3: system-design.md §16.3, FR-OVS-5. Read-only — the nightly worker job is the only writer. Always render with a "Projected — official status from TI" label; never as official. */
@Controller('clubs/:clubUnitId/dcp-projection')
export class DcpProjectionController {
  constructor(private readonly projections: DcpProjectionRepository) {}

  @Get()
  @ResourceScope('quality.dcp_projection', 'read', { source: 'param', key: 'clubUnitId' })
  async get(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query('programYearId') programYearId: string,
  ): Promise<DcpProjection> {
    const projection = await this.projections.findByClub(clubUnitId, programYearId);
    if (!projection) throw new NotFoundException('No DCP projection computed yet for that year');
    return projection;
  }
}
