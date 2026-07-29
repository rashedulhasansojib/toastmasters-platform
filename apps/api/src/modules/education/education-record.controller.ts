import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createEducationRecordRequestSchema,
  type CreateEducationRecordRequest,
  type EducationRecord,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { EducationRecordService } from './education-record.service';

const uuidPipe = new ZodValidationPipe(z.uuid());
const levelPipe = new ZodValidationPipe(z.coerce.number().int().min(1).max(5));

/** M7 Slice 1: system-design.md §10.1. `education.record` — new resource, VPE-owned. */
@Controller('clubs/:clubUnitId/education-records')
export class EducationRecordController {
  constructor(private readonly records: EducationRecordService) {}

  @Post()
  @ResourceScope('education.record', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createEducationRecordRequestSchema))
    body: CreateEducationRecordRequest,
  ): Promise<EducationRecord> {
    return this.records.create({ clubUnitId, ...body });
  }

  @Get()
  @ResourceScope('education.record', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query('personId') personId?: string,
  ): Promise<EducationRecord[]> {
    return this.records.list(clubUnitId, personId);
  }

  @Post(':id/levels/:level/mark-complete')
  @ResourceScope('education.record', 'update', { source: 'param', key: 'clubUnitId' })
  markComplete(
    @Param('id', uuidPipe) id: string,
    @Param('level', levelPipe) level: number,
  ): Promise<EducationRecord> {
    return this.records.markLevelComplete(id, level);
  }

  @Post(':id/levels/:level/confirm')
  @ResourceScope('education.record', 'approve', { source: 'param', key: 'clubUnitId' })
  confirm(
    @Param('id', uuidPipe) id: string,
    @Param('level', levelPipe) level: number,
    @CurrentUser() principal: Principal,
  ): Promise<EducationRecord> {
    return this.records.confirmLevel(id, level, principal.userId);
  }
}
