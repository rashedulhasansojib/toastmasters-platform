import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createPresidentContactLogRequestSchema,
  type CreatePresidentContactLogRequest,
  type PresidentContactLog,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { PresidentContactLogRepository } from './president-contact-log.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M6 Slice 1: system-design.md §16.2. Monthly Area Director / President contact record. */
@Controller('clubs/:clubUnitId/contact-log')
export class PresidentContactLogController {
  constructor(private readonly logs: PresidentContactLogRepository) {}

  @Post()
  @ResourceScope('quality.president_contact_log', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createPresidentContactLogRequestSchema))
    body: CreatePresidentContactLogRequest,
  ): Promise<PresidentContactLog> {
    return this.logs.create({
      areaUnitId: body.areaUnitId,
      clubUnitId,
      programYearId: body.programYearId,
      month: body.month,
      contactedAt: new Date(body.contactedAt),
      byPersonId: principal.userId,
      method: body.method,
      dcpDiscussed: body.dcpDiscussed,
      note: body.note,
    });
  }

  @Get()
  @ResourceScope('quality.president_contact_log', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<PresidentContactLog[]> {
    return this.logs.findByClub(clubUnitId);
  }
}
