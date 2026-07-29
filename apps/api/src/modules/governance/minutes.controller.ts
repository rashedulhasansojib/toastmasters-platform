import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  draftMinutesRequestSchema,
  newMinutesVersionRequestSchema,
  type DraftMinutesRequest,
  type NewMinutesVersionRequest,
  type Minutes,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { MinutesService } from './minutes.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M8 Slice 3: system-design.md §13.3, FR-GOV-3/4/5. */
@Controller('clubs/:clubUnitId')
export class MinutesController {
  constructor(private readonly minutesService: MinutesService) {}

  @Post('excom-meetings/:excomMeetingId/minutes')
  @ResourceScope('governance.minutes', 'create', { source: 'param', key: 'clubUnitId' })
  draft(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('excomMeetingId', uuidPipe) excomMeetingId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(draftMinutesRequestSchema)) body: DraftMinutesRequest,
  ): Promise<Minutes> {
    return this.minutesService.draftFromExCom(
      clubUnitId,
      excomMeetingId,
      body.programYearId,
      body.visibility,
      principal.userId,
    );
  }

  @Get('minutes')
  @ResourceScope('governance.minutes', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<Minutes[]> {
    return this.minutesService.list(clubUnitId);
  }

  @Post('minutes/:id/approve')
  @ResourceScope('governance.minutes', 'approve', { source: 'param', key: 'clubUnitId' })
  approve(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<Minutes> {
    return this.minutesService.approve(id, principal.userId);
  }

  @Post('minutes/:id/publish')
  @ResourceScope('governance.minutes', 'update', { source: 'param', key: 'clubUnitId' })
  publish(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<Minutes> {
    return this.minutesService.publish(id, principal.userId);
  }

  @Post('minutes/:id/new-version')
  @ResourceScope('governance.minutes', 'update', { source: 'param', key: 'clubUnitId' })
  newVersion(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(newMinutesVersionRequestSchema)) body: NewMinutesVersionRequest,
  ): Promise<Minutes> {
    return this.minutesService.newVersion(id, body.body, principal.userId);
  }
}
