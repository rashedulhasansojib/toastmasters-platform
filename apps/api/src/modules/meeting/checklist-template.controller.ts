import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  createChecklistTemplateRequestSchema,
  type CreateChecklistTemplateRequest,
  type ChecklistTemplate,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { ChecklistTemplateRepository } from './checklist-template.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/** M3 Slice 5. Same club-scoped-in-the-URL shape as the rest of this module; no service layer. */
@Controller('clubs/:clubUnitId/checklist-templates')
export class ChecklistTemplateController {
  constructor(private readonly templates: ChecklistTemplateRepository) {}

  @Post()
  @ResourceScope('meeting.checklist', 'create', { source: 'param', key: 'clubUnitId' })
  async create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createChecklistTemplateRequestSchema))
    body: CreateChecklistTemplateRequest,
  ): Promise<ChecklistTemplate> {
    return this.templates.create({
      orgUnitId: clubUnitId,
      name: body.name,
      appliesTo: body.appliesTo,
      items: body.items,
    });
  }

  @Get()
  @ResourceScope('meeting.checklist', 'read', { source: 'param', key: 'clubUnitId' })
  async list(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<ChecklistTemplate[]> {
    return this.templates.findByOrgUnit(clubUnitId);
  }
}
