import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createClubSuccessPlanRequestSchema,
  updateClubSuccessPlanRequestSchema,
  addClubSuccessPlanReviewRequestSchema,
  type CreateClubSuccessPlanRequest,
  type UpdateClubSuccessPlanRequest,
  type AddClubSuccessPlanReviewRequest,
  type ClubSuccessPlan,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { ClubSuccessPlanRepository } from './club-success-plan.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M6 Slice 2: system-design.md §13.4. DCP qualifying requirement, due 30 Sep. */
@Controller('clubs/:clubUnitId/success-plan')
export class ClubSuccessPlanController {
  constructor(private readonly plans: ClubSuccessPlanRepository) {}

  @Post()
  @ResourceScope('governance.club_success_plan', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createClubSuccessPlanRequestSchema))
    body: CreateClubSuccessPlanRequest,
  ): Promise<ClubSuccessPlan> {
    return this.plans.create({ clubUnitId, ...body });
  }

  @Get()
  @ResourceScope('governance.club_success_plan', 'read', { source: 'param', key: 'clubUnitId' })
  async get(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query('programYearId') programYearId: string,
  ): Promise<ClubSuccessPlan> {
    const plan = await this.plans.findByClubAndYear(clubUnitId, programYearId);
    if (!plan) throw new NotFoundException('No Club Success Plan for that year yet');
    return plan;
  }

  @Patch(':id')
  @ResourceScope('governance.club_success_plan', 'update', { source: 'param', key: 'clubUnitId' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(updateClubSuccessPlanRequestSchema))
    body: UpdateClubSuccessPlanRequest,
  ): Promise<ClubSuccessPlan> {
    return this.plans.update(id, body);
  }

  @Post(':id/submit')
  @ResourceScope('governance.club_success_plan', 'update', { source: 'param', key: 'clubUnitId' })
  submit(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<ClubSuccessPlan> {
    return this.plans.submit(id, principal.userId);
  }

  @Post(':id/reviews')
  @ResourceScope('governance.club_success_plan', 'update', { source: 'param', key: 'clubUnitId' })
  addReview(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(addClubSuccessPlanReviewRequestSchema))
    body: AddClubSuccessPlanReviewRequest,
  ): Promise<ClubSuccessPlan> {
    return this.plans.addReview(id, {
      at: new Date().toISOString(),
      byPersonId: principal.userId,
      note: body.note,
    });
  }
}
