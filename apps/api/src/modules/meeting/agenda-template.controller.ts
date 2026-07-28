import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createAgendaTemplateRequestSchema,
  type CreateAgendaTemplateRequest,
  type AgendaTemplate,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { AgendaTemplateRepository } from './agenda-template.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M3 Slice 9. Reuses `meeting.agenda_item`'s create/read grants — building a
 * reusable template is the same capability as building one meeting's
 * agenda, just club-scoped instead of meeting-scoped. No new resource.
 */
@Controller('clubs/:clubUnitId/agenda-templates')
export class AgendaTemplateController {
  constructor(private readonly templates: AgendaTemplateRepository) {}

  @Post()
  @ResourceScope('meeting.agenda_item', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createAgendaTemplateRequestSchema))
    body: CreateAgendaTemplateRequest,
  ): Promise<AgendaTemplate> {
    return this.templates.create({ orgUnitId: clubUnitId, name: body.name, items: body.items });
  }

  @Get()
  @ResourceScope('meeting.agenda_item', 'read', { source: 'param', key: 'clubUnitId' })
  async list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<AgendaTemplate[]> {
    return this.templates.findByOrgUnit(clubUnitId);
  }
}
