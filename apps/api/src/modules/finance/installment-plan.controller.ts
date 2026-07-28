import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createInstallmentPlanRequestSchema,
  recordInstallmentPaymentRequestSchema,
  cancelInstallmentPlanRequestSchema,
  type CreateInstallmentPlanRequest,
  type RecordInstallmentPaymentRequest,
  type CancelInstallmentPlanRequest,
  type InstallmentPlan,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { InstallmentPlanService } from './installment-plan.service';

const uuidPipe = new ZodValidationPipe(z.uuid());
const seqPipe = new ZodValidationPipe(z.coerce.number().int().positive());

/** M4 Slice 8: system-design.md §12.3 / CLAUDE.md §2 decision 8 — Treasurer approves alone; holding `finance.installment_plan:create` at this club IS the approval, no separate step. */
@Controller('clubs/:clubUnitId/installment-plans')
export class InstallmentPlanController {
  constructor(private readonly plans: InstallmentPlanService) {}

  @Post()
  @ResourceScope('finance.installment_plan', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createInstallmentPlanRequestSchema))
    body: CreateInstallmentPlanRequest,
  ): Promise<InstallmentPlan> {
    return this.plans.create(clubUnitId, { ...body, approvedBy: principal.userId });
  }

  @Get()
  @ResourceScope('finance.installment_plan', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<InstallmentPlan[]> {
    return this.plans.list(clubUnitId);
  }

  @Get(':planId')
  @ResourceScope('finance.installment_plan', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('planId', uuidPipe) planId: string,
  ): Promise<InstallmentPlan> {
    const plan = await this.plans.findById(planId);
    if (!plan || plan.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Installment plan not found');
    }
    return plan;
  }

  @Post(':planId/schedule/:seq/payments')
  @ResourceScope('finance.installment_plan', 'update', { source: 'param', key: 'clubUnitId' })
  recordPayment(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('planId', uuidPipe) planId: string,
    @Param('seq', seqPipe) seq: number,
    @Body(new ZodValidationPipe(recordInstallmentPaymentRequestSchema))
    body: RecordInstallmentPaymentRequest,
  ): Promise<InstallmentPlan> {
    return this.plans.recordPayment({
      orgUnitId: clubUnitId,
      planId,
      seq,
      ledgerEntryId: body.ledgerEntryId,
    });
  }

  @Post(':planId/cancel')
  @ResourceScope('finance.installment_plan', 'update', { source: 'param', key: 'clubUnitId' })
  cancel(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('planId', uuidPipe) planId: string,
    @Body(new ZodValidationPipe(cancelInstallmentPlanRequestSchema))
    body: CancelInstallmentPlanRequest,
  ): Promise<InstallmentPlan> {
    return this.plans.cancel(clubUnitId, planId, body.reason);
  }
}
