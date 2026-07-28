import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createProspectVisitRequestSchema,
  type CreateProspectVisitRequest,
  type ProspectVisit,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { ProspectService } from './prospect.service';
import { ProspectVisitRepository } from './prospect-visit.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M4 Slice 2: system-design.md §11.1's `visits` log. Reuses `membership.prospect` — same resource, no new grant. */
@Controller('clubs/:clubUnitId/prospects/:prospectId/visits')
export class ProspectVisitController {
  constructor(
    private readonly prospects: ProspectService,
    private readonly visits: ProspectVisitRepository,
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
    @Body(new ZodValidationPipe(createProspectVisitRequestSchema))
    body: CreateProspectVisitRequest,
  ): Promise<ProspectVisit> {
    await this.assertProspectInClub(clubUnitId, prospectId);
    return this.visits.create({
      prospectId,
      meetingId: body.meetingId,
      attendedAt: new Date(body.attendedAt),
      loggedBy: principal.userId,
    });
  }

  @Get()
  @ResourceScope('membership.prospect', 'read', { source: 'param', key: 'clubUnitId' })
  async list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('prospectId', uuidPipe) prospectId: string,
  ): Promise<ProspectVisit[]> {
    await this.assertProspectInClub(clubUnitId, prospectId);
    return this.visits.findByProspect(prospectId);
  }
}
