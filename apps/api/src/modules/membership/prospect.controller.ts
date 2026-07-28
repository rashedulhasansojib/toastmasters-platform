import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createProspectRequestSchema,
  updateProspectRequestSchema,
  type CreateProspectRequest,
  type UpdateProspectRequest,
  type Prospect,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { ProspectService } from './prospect.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 1: the prospect pipeline. Club-scoped in the URL, matching every meeting-module controller's precedent. */
@Controller('clubs/:clubUnitId/prospects')
export class ProspectController {
  constructor(private readonly prospects: ProspectService) {}

  private async assertProspectInClub(clubUnitId: string, prospectId: string): Promise<Prospect> {
    const prospect = await this.prospects.findById(prospectId);
    if (!prospect || prospect.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Prospect not found');
    }
    return prospect;
  }

  @Post()
  @ResourceScope('membership.prospect', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createProspectRequestSchema)) body: CreateProspectRequest,
  ): Promise<Prospect> {
    return this.prospects.create({ ...body, orgUnitId: clubUnitId, createdBy: principal.userId });
  }

  @Get()
  @ResourceScope('membership.prospect', 'read', { source: 'param', key: 'clubUnitId' })
  list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<Prospect[]> {
    return this.prospects.list(clubUnitId);
  }

  @Get(':prospectId')
  @ResourceScope('membership.prospect', 'read', { source: 'param', key: 'clubUnitId' })
  async findOne(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('prospectId', uuidPipe) prospectId: string,
  ): Promise<Prospect> {
    return this.assertProspectInClub(clubUnitId, prospectId);
  }

  @Patch(':prospectId')
  @ResourceScope('membership.prospect', 'update', { source: 'param', key: 'clubUnitId' })
  async update(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('prospectId', uuidPipe) prospectId: string,
    @Body(new ZodValidationPipe(updateProspectRequestSchema)) body: UpdateProspectRequest,
  ): Promise<Prospect> {
    await this.assertProspectInClub(clubUnitId, prospectId);
    return this.prospects.update(prospectId, body);
  }
}
