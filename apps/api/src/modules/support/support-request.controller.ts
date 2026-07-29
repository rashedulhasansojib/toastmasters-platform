import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createSupportRequestSchema,
  respondSupportRequestSchema,
  type CreateSupportRequest,
  type RespondSupportRequest,
  type SupportRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { SupportRequestService } from './support-request.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M8 Slice 5: system-design.md §17, FR-SUP-3. */
@Controller('clubs/:clubUnitId/support-requests')
export class SupportRequestController {
  constructor(private readonly requests: SupportRequestService) {}

  @Post()
  @ResourceScope('support.request', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createSupportRequestSchema)) body: CreateSupportRequest,
  ): Promise<SupportRequest> {
    return this.requests.create({
      requestingUnitId: clubUnitId,
      meetingId: body.meetingId,
      roleKey: body.roleKey,
      neededBy: new Date(body.neededBy),
    });
  }

  @Get()
  @ResourceScope('support.request', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<SupportRequest[]> {
    return this.requests.list(clubUnitId);
  }

  @Post(':id/respond')
  respond(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(respondSupportRequestSchema)) body: RespondSupportRequest,
  ): Promise<SupportRequest> {
    return this.requests.respond(id, principal.userId, body.response);
  }
}
