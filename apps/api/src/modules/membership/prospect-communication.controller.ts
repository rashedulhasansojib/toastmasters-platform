import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createProspectCommunicationRequestSchema,
  type CreateProspectCommunicationRequest,
  type ProspectCommunication,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { ProspectService } from './prospect.service';
import { ProspectCommunicationRepository } from './prospect-communication.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 2: system-design.md §11.1's `communications` log. Reuses `membership.prospect` — same resource, no new grant. */
@Controller('clubs/:clubUnitId/prospects/:prospectId/communications')
export class ProspectCommunicationController {
  constructor(
    private readonly prospects: ProspectService,
    private readonly communications: ProspectCommunicationRepository,
  ) {}

  private async assertProspectInClub(clubUnitId: string, prospectId: string): Promise<void> {
    const prospect = await this.prospects.findById(prospectId);
    if (!prospect || prospect.orgUnitId !== clubUnitId) {
      throw new NotFoundException('Prospect not found');
    }
  }

  @Post()
  @ResourceScope('membership.prospect', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('prospectId', uuidPipe) prospectId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createProspectCommunicationRequestSchema))
    body: CreateProspectCommunicationRequest,
  ): Promise<ProspectCommunication> {
    await this.assertProspectInClub(clubUnitId, prospectId);
    return this.communications.create({
      prospectId,
      channel: body.channel,
      note: body.note,
      loggedBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('membership.prospect', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('prospectId', uuidPipe) prospectId: string,
  ): Promise<ProspectCommunication[]> {
    await this.assertProspectInClub(clubUnitId, prospectId);
    return this.communications.findByProspect(prospectId);
  }
}
