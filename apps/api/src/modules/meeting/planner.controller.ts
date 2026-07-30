import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  plannerImportRequestSchema,
  type PlannerImportRequest,
  type PlannerImportResult,
  type PlannerRow,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { PlannerService } from './planner.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** Defaults to a season's worth either side, which is how clubs actually plan. */
const rangeQuerySchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

const DEFAULT_BACK_DAYS = 30;
const DEFAULT_FORWARD_DAYS = 180;

/**
 * FR-MTG-5: the multi-week planner. Read + import only — a cell edit is a
 * `meeting.role` write and goes through that controller, because the planner
 * is a projection and must not become a second way to mutate assignments.
 */
@Controller('clubs/:clubUnitId/planner')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Get()
  @ResourceScope('meeting.planner', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query(new ZodValidationPipe(rangeQuerySchema)) query: z.infer<typeof rangeQuerySchema>,
  ): Promise<PlannerRow[]> {
    const now = Date.now();
    const from = query.from ? new Date(query.from) : new Date(now - DEFAULT_BACK_DAYS * 86_400_000);
    const to = query.to ? new Date(query.to) : new Date(now + DEFAULT_FORWARD_DAYS * 86_400_000);
    if (from > to) {
      throw new BadRequestException('`from` must not be after `to`.');
    }
    return this.planner.list(clubUnitId, from, to);
  }

  @Post('import')
  @ResourceScope('meeting.planner', 'create', { source: 'param', key: 'clubUnitId' })
  import(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(plannerImportRequestSchema)) body: PlannerImportRequest,
  ): Promise<PlannerImportResult> {
    return this.planner.import(clubUnitId, body, principal.userId);
  }
}
